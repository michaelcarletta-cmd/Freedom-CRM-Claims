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
      <TabsList className="flex flex-row w-full bg-muted/40 p-2 gap-1 overflow-x-auto scrollbar-hide">
        <TabsTrigger value="emails" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">Emails</TabsTrigger>
        <TabsTrigger value="sms" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">SMS / Text</TabsTrigger>
        <TabsTrigger value="phone" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">Phone Calls</TabsTrigger>
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
