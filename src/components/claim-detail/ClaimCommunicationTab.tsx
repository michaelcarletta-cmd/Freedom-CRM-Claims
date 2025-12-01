import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimEmails } from "./ClaimEmails";
import { ClaimCommunications } from "./ClaimCommunications";
import { ClaimSMS } from "./ClaimSMS";

interface ClaimCommunicationTabProps {
  claimId: string;
  policyholderPhone?: string;
  policyholderEmail?: string;
  policyholderName?: string;
  claimNumber?: string;
}

export function ClaimCommunicationTab({ 
  claimId, 
  policyholderPhone,
  policyholderEmail,
  policyholderName,
  claimNumber 
}: ClaimCommunicationTabProps) {
  return (
    <Tabs defaultValue="emails" className="w-full">
      <TabsList>
        <TabsTrigger value="emails">Emails</TabsTrigger>
        <TabsTrigger value="sms">SMS / Text</TabsTrigger>
        <TabsTrigger value="phone">Phone Calls</TabsTrigger>
      </TabsList>
      <TabsContent value="emails" className="mt-6">
        <ClaimEmails 
          claimId={claimId} 
          policyholderEmail={policyholderEmail}
          policyholderName={policyholderName}
          claimNumber={claimNumber}
        />
      </TabsContent>
      <TabsContent value="sms" className="mt-6">
        <ClaimSMS claimId={claimId} policyholderPhone={policyholderPhone} />
      </TabsContent>
      <TabsContent value="phone" className="mt-6">
        <ClaimCommunications claimId={claimId} />
      </TabsContent>
    </Tabs>
  );
}
