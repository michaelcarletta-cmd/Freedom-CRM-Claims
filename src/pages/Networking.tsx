import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorsTab } from "@/components/networking/ContractorsTab";
import { ReferrersTab } from "@/components/networking/ReferrersTab";
import { InsuranceCompaniesTab } from "@/components/networking/InsuranceCompaniesTab";
import { MortgageCompaniesTab } from "@/components/networking/MortgageCompaniesTab";

export default function Networking() {
  return (
    <div className="space-y-4 md:space-y-8 p-4 md:p-0">
      <div className="space-y-2 md:space-y-3">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">Networking</h1>
        <p className="text-muted-foreground text-sm md:text-lg">
          Manage your network of contractors, referrers, insurance companies, and mortgage companies
        </p>
      </div>

      <Tabs defaultValue="contractors" className="space-y-6">
        <TabsList className="flex flex-col md:flex-row w-full bg-muted p-2 gap-1 h-auto rounded-md">
          <TabsTrigger value="contractors" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Contractors
          </TabsTrigger>
          <TabsTrigger value="referrers" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Referrers
          </TabsTrigger>
          <TabsTrigger value="insurance" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
            Insurance Companies
          </TabsTrigger>
          <TabsTrigger value="mortgage" className="w-full md:w-auto justify-start text-sm md:text-base font-medium px-3 md:px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground rounded-sm">
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