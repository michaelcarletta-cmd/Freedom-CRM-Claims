import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, User, Bell, Mail, MessageSquare, ChevronDown, Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

interface ProfileData {
  full_name: string | null;
  email: string;
  phone: string | null;
  title: string | null;
  license_number: string | null;
  license_state: string | null;
  email_signature: string | null;
}

interface NotificationPreferences {
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
}

export function ProfileSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: "",
    email: "",
    phone: "",
    title: "",
    license_number: "",
    license_state: "",
    email_signature: "",
  });
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    in_app_enabled: true,
    email_enabled: true,
    sms_enabled: false,
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchNotificationPreferences();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setProfile({
        full_name: data.full_name || "",
        email: data.email || "",
        phone: data.phone || "",
        title: (data as any).title || "",
        license_number: (data as any).license_number || "",
        license_state: (data as any).license_state || "",
        email_signature: (data as any).email_signature || "",
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotificationPreferences = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.rpc('get_or_create_notification_preferences', {
        p_user_id: user.id
      });

      if (error) throw error;

      if (data) {
        setPreferences({
          in_app_enabled: data.in_app_enabled,
          email_enabled: data.email_enabled,
          sms_enabled: data.sms_enabled,
        });
      }
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          title: profile.title,
          license_number: profile.license_number,
          license_state: profile.license_state,
          email_signature: profile.email_signature,
        } as any)
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user) return;
    
    setSavingNotifications(true);
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .update({
          in_app_enabled: preferences.in_app_enabled,
          email_enabled: preferences.email_enabled,
          sms_enabled: preferences.sms_enabled,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Notification preferences saved");
    } catch (error) {
      console.error("Error saving notification preferences:", error);
      toast.error("Failed to save notification preferences");
    } finally {
      setSavingNotifications(false);
    }
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Update your profile details and contact information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={profile.full_name || ""}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={profile.title || ""}
                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                placeholder="Public Adjuster"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone || ""}
                onChange={(e) => setProfile({ ...profile, phone: formatPhoneNumber(e.target.value) })}
                placeholder="123-456-7890"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Licensing Information</CardTitle>
          <CardDescription>
            Your professional licensing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="license_number">License Number</Label>
              <Input
                id="license_number"
                value={profile.license_number || ""}
                onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                placeholder="PA-12345"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license_state">License State</Label>
              <Input
                id="license_state"
                value={profile.license_state || ""}
                onChange={(e) => setProfile({ ...profile, license_state: e.target.value })}
                placeholder="FL"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            This signature will be appended to emails sent from the CRM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email_signature">Signature</Label>
            <Textarea
              id="email_signature"
              value={profile.email_signature || ""}
              onChange={(e) => setProfile({ ...profile, email_signature: e.target.value })}
              placeholder="Best regards,&#10;John Doe&#10;Public Adjuster&#10;License #PA-12345&#10;Phone: (555) 123-4567"
              rows={6}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Tip: Include your name, title, license number, and contact information.
          </p>
        </CardContent>
      </Card>

      {/* Notifications - Collapsible */}
      <Collapsible open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose how you want to receive notifications
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${notificationsOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="in-app" className="text-base font-medium">
                      In-App Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications within the application
                    </p>
                  </div>
                </div>
                <Switch
                  id="in-app"
                  checked={preferences.in_app_enabled}
                  onCheckedChange={() => togglePreference("in_app_enabled")}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="email-notif" className="text-base font-medium">
                      Email Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                </div>
                <Switch
                  id="email-notif"
                  checked={preferences.email_enabled}
                  onCheckedChange={() => togglePreference("email_enabled")}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-primary/10">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="sms" className="text-base font-medium">
                      SMS Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via text message
                    </p>
                  </div>
                </div>
                <Switch
                  id="sms"
                  checked={preferences.sms_enabled}
                  onCheckedChange={() => togglePreference("sms_enabled")}
                />
              </div>

              <div className="pt-2">
                <Button onClick={handleSaveNotifications} disabled={savingNotifications}>
                  {savingNotifications && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Notification Preferences
                </Button>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Notification Types</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>Tasks:</strong> Due date reminders, overdue alerts, and new task assignments</li>
                  <li>• <strong>Claims:</strong> Status updates, new activity, and portal notifications</li>
                  <li>• <strong>Inspections:</strong> Scheduled inspection reminders</li>
                  <li>• <strong>Signatures:</strong> Document signing requests and completions</li>
                </ul>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}