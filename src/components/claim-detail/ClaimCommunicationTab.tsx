import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimEmails } from "./ClaimEmails";
import { ClaimCommunications } from "./ClaimCommunications";
import { ClaimSMS } from "./ClaimSMS";

interface ClaimCommunicationTabProps {
  claimId: string;
  claim: any;
}

export function ClaimCommunicationTab({ 
  claimId, 
  claim
}: { claimId: string; claim: any }) {
  return (
    <Tabs defaultValue="emails" className="w-full">
      <TabsList className="bg-sidebar p-1 gap-1 rounded-none">
        <TabsTrigger value="emails" className="text-sidebar-foreground/70 data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-foreground rounded-sm">Emails</TabsTrigger>
        <TabsTrigger value="sms" className="text-sidebar-foreground/70 data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-foreground rounded-sm">SMS / Text</TabsTrigger>
        <TabsTrigger value="phone" className="text-sidebar-foreground/70 data-[state=active]:bg-sidebar-accent data-[state=active]:text-sidebar-foreground rounded-sm">Phone Calls</TabsTrigger>
      </TabsList>
      <TabsContent value="emails" className="mt-6">
        <ClaimEmails claimId={claimId} claim={claim} />
      </TabsContent>
      <TabsContent value="sms" className="mt-6">
        <ClaimSMS claimId={claimId} policyholderPhone={claim.policyholder_phone} />
      </TabsContent>
      <TabsContent value="phone" className="mt-6">
        <ClaimCommunications claimId={claimId} />
      </TabsContent>
    </Tabs>
  );
}
