import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for field-level encryption using Supabase Vault (pgsodium)
 * 
 * Usage:
 * const { encryptField, decryptField, encryptObject, decryptObject } = useEncryption();
 * 
 * // Encrypt a single field
 * const encrypted = await encryptField("sensitive data");
 * 
 * // Decrypt a single field
 * const decrypted = await decryptField(encrypted);
 * 
 * // Encrypt multiple fields in an object
 * const encryptedData = await encryptObject(data, ['email', 'phone', 'ssn']);
 */

export function useEncryption() {
  /**
   * Encrypt a single plaintext value
   */
  const encryptField = async (plaintext: string | null, keyName: string = 'pii_key'): Promise<string | null> => {
    if (!plaintext) return plaintext;
    
    try {
      const { data, error } = await supabase.rpc('encrypt_pii', {
        p_plaintext: plaintext,
        p_key_name: keyName
      });
      
      if (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
      }
      
      return data;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  };

  /**
   * Decrypt a single encrypted value
   */
  const decryptField = async (ciphertext: string | null, keyName: string = 'pii_key'): Promise<string | null> => {
    if (!ciphertext) return ciphertext;
    
    try {
      const { data, error } = await supabase.rpc('decrypt_pii', {
        p_ciphertext: ciphertext,
        p_key_name: keyName
      });
      
      if (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
      }
      
      return data;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  };

  /**
   * Encrypt specific fields in an object
   */
  const encryptObject = async <T extends Record<string, unknown>>(
    obj: T,
    fieldsToEncrypt: (keyof T)[],
    keyName: string = 'pii_key'
  ): Promise<T> => {
    const result = { ...obj };
    
    await Promise.all(
      fieldsToEncrypt.map(async (field) => {
        const value = obj[field];
        if (typeof value === 'string' && value) {
          (result as Record<string, unknown>)[field as string] = await encryptField(value, keyName);
        }
      })
    );
    
    return result;
  };

  /**
   * Decrypt specific fields in an object
   */
  const decryptObject = async <T extends Record<string, unknown>>(
    obj: T,
    fieldsToDecrypt: (keyof T)[],
    keyName: string = 'pii_key'
  ): Promise<T> => {
    const result = { ...obj };
    
    await Promise.all(
      fieldsToDecrypt.map(async (field) => {
        const value = obj[field];
        if (typeof value === 'string' && value) {
          (result as Record<string, unknown>)[field as string] = await decryptField(value, keyName);
        }
      })
    );
    
    return result;
  };

  /**
   * Check if a string appears to be encrypted (base64 encoded)
   */
  const isEncrypted = (value: string): boolean => {
    if (!value) return false;
    // Check if it looks like base64 and has minimum length for our encryption format
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    return value.length > 40 && base64Pattern.test(value);
  };

  return {
    encryptField,
    decryptField,
    encryptObject,
    decryptObject,
    isEncrypted,
  };
}

/**
 * List of PII fields that should be encrypted
 */
export const PII_FIELDS = [
  'full_name',
  'email',
  'phone',
  'address',
  'policyholder_name',
  'policyholder_email',
  'policyholder_phone',
  'policyholder_address',
  'policy_number',
  'claim_number',
  'ssn_last_four',
  'notes',
] as const;

export type PIIField = typeof PII_FIELDS[number];
