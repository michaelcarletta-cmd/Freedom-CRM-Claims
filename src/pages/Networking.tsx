import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorsTab } from "@/components/networking/ContractorsTab";
import { ReferrersTab } from "@/components/networking/ReferrersTab";
import { InsuranceCompaniesTab } from "@/components/networking/InsuranceCompaniesTab";
import { MortgageCompaniesTab } from "@/components/networking/MortgageCompaniesTab";

export default function Networking() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Networking</h1>
          <p className="text-muted-foreground">
            Manage your network of contractors, referrers, insurance companies, and mortgage companies
          </p>
        </div>

        <Tabs defaultValue="contractors" className="space-y-4">
          <TabsList>
            <TabsTrigger value="contractors">Contractors</TabsTrigger>
            <TabsTrigger value="referrers">Referrers</TabsTrigger>
            <TabsTrigger value="insurance">Insurance Companies</TabsTrigger>
            <TabsTrigger value="mortgage">Mortgage Companies</TabsTrigger>
          </TabsList>

          <TabsContent value="contractors">
            <ContractorsTab />
          </TabsContent>

          <TabsContent value="referrers">
            <ReferrersTab />
          </TabsContent>

          <TabsContent value="insurance">
            <InsuranceCompaniesTab />
          </TabsContent>

          <TabsContent value="mortgage">
            <MortgageCompaniesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}