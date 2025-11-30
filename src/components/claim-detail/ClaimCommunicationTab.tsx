import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaimEmails } from "./ClaimEmails";
import { ClaimCommunications } from "./ClaimCommunications";

interface ClaimCommunicationTabProps {
  claimId: string;
}

export function ClaimCommunicationTab({ claimId }: ClaimCommunicationTabProps) {
  return (
    <Tabs defaultValue="emails" className="w-full">
      <TabsList>
        <TabsTrigger value="emails">Emails</TabsTrigger>
        <TabsTrigger value="phone">Phone & Text</TabsTrigger>
      </TabsList>
      <TabsContent value="emails" className="mt-6">
        <ClaimEmails claimId={claimId} />
      </TabsContent>
      <TabsContent value="phone" className="mt-6">
        <ClaimCommunications claimId={claimId} />
      </TabsContent>
    </Tabs>
  );
}
