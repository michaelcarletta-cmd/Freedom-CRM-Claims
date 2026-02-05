 import { cn } from "@/lib/utils";
 import { IndicatorState, IndicatorValue } from "./types";
 import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
 
 interface IndicatorInputProps {
   id: string;
   label: string;
   weight: number;
   isPositive: boolean;
   description?: string;
   value: IndicatorValue | undefined;
   onChange: (id: string, value: IndicatorValue) => void;
 }
 
 export function IndicatorInput({
   id,
   label,
   weight,
   isPositive,
   description,
   value,
   onChange,
 }: IndicatorInputProps) {
   const state = value?.state || 'unknown';
 
   const handleStateChange = (newState: IndicatorState) => {
     onChange(id, { state: newState, notes: value?.notes });
   };
 
   const getButtonClasses = (buttonState: IndicatorState) => {
     const isActive = state === buttonState;
     
     const baseClasses = "flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors";
     
     if (!isActive) {
       return cn(baseClasses, "border-muted bg-background hover:bg-muted/50 text-muted-foreground");
     }
     
     switch (buttonState) {
       case 'present':
         return cn(baseClasses, "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400");
       case 'absent':
         return cn(baseClasses, "border-muted bg-muted/50 text-muted-foreground");
       case 'unknown':
         return cn(baseClasses, "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400");
       default:
         return baseClasses;
     }
   };
 
   return (
     <div className="flex items-start gap-3 p-2 rounded-lg border border-muted/50 bg-background">
       <div className="flex-1 min-w-0">
         <div className="flex items-center gap-2 flex-wrap">
           <span className="text-sm font-medium">{label}</span>
           <span className={cn(
             "text-xs px-1.5 py-0.5 rounded",
             isPositive 
               ? "bg-green-500/10 text-green-700 dark:text-green-400" 
               : "bg-red-500/10 text-red-700 dark:text-red-400"
           )}>
             {isPositive ? '+' : '-'}{weight}
           </span>
         </div>
         {description && (
           <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
         )}
       </div>
       
       <div className="flex gap-1 flex-shrink-0">
         <button
           type="button"
           onClick={() => handleStateChange('present')}
           className={getButtonClasses('present')}
           title="Present: Indicator is observed or documented"
         >
           <CheckCircle2 className="h-3 w-3" />
           Yes
         </button>
         <button
           type="button"
           onClick={() => handleStateChange('absent')}
           className={getButtonClasses('absent')}
           title="Absent: Explicitly observed NOT to exist"
         >
           <XCircle className="h-3 w-3" />
           No
         </button>
         <button
           type="button"
           onClick={() => handleStateChange('unknown')}
           className={getButtonClasses('unknown')}
           title="Unknown: Not observed, not documented, or not evaluated"
         >
           <HelpCircle className="h-3 w-3" />
           ?
         </button>
       </div>
     </div>
   );
 }