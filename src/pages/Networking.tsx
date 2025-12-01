import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorsTab } from "@/components/networking/ContractorsTab";
import { ReferrersTab } from "@/components/networking/ReferrersTab";
import { InsuranceCompaniesTab } from "@/components/networking/InsuranceCompaniesTab";
import { MortgageCompaniesTab } from "@/components/networking/MortgageCompaniesTab";

export default function Networking() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Networking</h1>
          <p className="text-muted-foreground text-lg">
            Manage your network of contractors, referrers, insurance companies, and mortgage companies
          </p>
        </div>

        <Tabs defaultValue="contractors" className="space-y-6">
          <TabsList className="h-12 p-1">
            <TabsTrigger value="contractors" className="text-base px-6">Contractors</TabsTrigger>
            <TabsTrigger value="referrers" className="text-base px-6">Referrers</TabsTrigger>
            <TabsTrigger value="insurance" className="text-base px-6">Insurance Companies</TabsTrigger>
            <TabsTrigger value="mortgage" className="text-base px-6">Mortgage Companies</TabsTrigger>
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