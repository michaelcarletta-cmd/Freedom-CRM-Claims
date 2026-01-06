import { useState, useEffect, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_CHECK_INTERVAL = 60 * 1000; // Check every minute

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionTokenRef = useRef<string | null>(null);
  const { toast } = useToast();

  // Generate a unique session token
  const generateSessionToken = useCallback(() => {
    return crypto.randomUUID() + '-' + Date.now().toString(36);
  }, []);

  // Register session in database
  const registerSession = useCallback(async () => {
    try {
      const token = generateSessionToken();
      sessionTokenRef.current = token;
      localStorage.setItem('session_token', token);
      
      await supabase.rpc('register_session', {
        p_session_token: token,
        p_device_info: navigator.userAgent,
        p_ip_address: null
      });
      
      lastActivityRef.current = Date.now();
    } catch (error) {
      console.error('Session registration error:', error);
    }
  }, [generateSessionToken]);

  // Invalidate session in database
  const invalidateSession = useCallback(async () => {
    const token = sessionTokenRef.current || localStorage.getItem('session_token');
    if (!token) return;
    
    try {
      await supabase.rpc('invalidate_session', {
        p_session_token: token
      });
    } catch (error) {
      console.error('Failed to invalidate session:', error);
    } finally {
      localStorage.removeItem('session_token');
      sessionTokenRef.current = null;
    }
  }, []);

  // Validate session with server
  const validateSession = useCallback(async () => {
    const token = sessionTokenRef.current || localStorage.getItem('session_token');
    if (!token) return { isValid: true, reason: 'No token yet' };
    
    try {
      const { data, error } = await supabase.rpc('validate_session', {
        p_session_token: token
      });
      
      if (error) return { isValid: false, reason: error.message };
      
      const result = data?.[0];
      return { 
        isValid: result?.is_valid ?? true, 
        reason: result?.reason || 'Valid' 
      };
    } catch {
      return { isValid: true, reason: 'Validation skipped' };
    }
  }, []);

  // Handle session expiration
  const handleSessionExpired = useCallback(async (reason: string) => {
    toast({
      title: "Session Expired",
      description: reason,
      variant: "destructive",
    });
    
    await invalidateSession();
    await supabase.auth.signOut();
  }, [invalidateSession, toast]);

  // Update activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (event === 'SIGNED_IN' && session?.user) {
          // Register session on login
          setTimeout(() => {
            registerSession();
            fetchUserRole(session.user.id);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setUserRole(null);
        } else if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Restore session token from localStorage
        const token = localStorage.getItem('session_token');
        if (token) {
          sessionTokenRef.current = token;
        }
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [registerSession]);

  // Activity tracking
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [updateActivity]);

  // Periodic session validation
  useEffect(() => {
    if (!user) return;
    
    const intervalId = setInterval(async () => {
      // Check client-side inactivity
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > INACTIVITY_TIMEOUT_MS) {
        await handleSessionExpired('Session timed out due to inactivity');
        return;
      }
      
      // Validate with server (checks role changes, single session, etc.)
      const { isValid, reason } = await validateSession();
      if (!isValid && reason !== 'No token yet') {
        await handleSessionExpired(reason);
      }
    }, ACTIVITY_CHECK_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [user, handleSessionExpired, validateSession]);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user role:", error);
        setUserRole(null);
      } else {
        setUserRole(data?.role ?? null);
      }
    } catch (error) {
      console.error("Error in fetchUserRole:", error);
      setUserRole(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await invalidateSession();
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    userRole,
    loading,
    signOut,
  };
}
