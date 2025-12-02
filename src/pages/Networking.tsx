import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorsTab } from "@/components/networking/ContractorsTab";
import { ReferrersTab } from "@/components/networking/ReferrersTab";
import { InsuranceCompaniesTab } from "@/components/networking/InsuranceCompaniesTab";
import { MortgageCompaniesTab } from "@/components/networking/MortgageCompaniesTab";

export default function Networking() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Networking</h1>
        <p className="text-muted-foreground text-lg">
          Manage your network of contractors, referrers, insurance companies, and mortgage companies
        </p>
      </div>

      <Tabs defaultValue="contractors" className="space-y-6">
        <TabsList className="flex flex-row w-full bg-muted/40 p-2 gap-1 overflow-x-auto scrollbar-hide">
          <TabsTrigger value="contractors" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            Contractors
          </TabsTrigger>
          <TabsTrigger value="referrers" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            Referrers
          </TabsTrigger>
          <TabsTrigger value="insurance" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            Insurance Companies
          </TabsTrigger>
          <TabsTrigger value="mortgage" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap">
            Mortgage Companies
          </TabsTrigger>
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
  );
}