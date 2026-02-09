import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Cloud, CloudRain, Wind, Loader2, RefreshCw, AlertTriangle, Snowflake, Sun, ThermometerSun } from "lucide-react";
import { format } from "date-fns";

interface DarwinWeatherHistoryProps {
  claimId: string;
  claim: any;
}

interface WeatherData {
  date: string;
  location: string;
  summary: string;
  conditions: {
    temperature_high?: number;
    temperature_low?: number;
    precipitation?: string;
    wind_speed?: number;
    wind_gusts?: number;
    hail_reported?: boolean;
    tornado_warning?: boolean;
    severe_storm_warning?: boolean;
  };
  sources: string[];
  relevantEvents: string[];
}

export const DarwinWeatherHistory = ({ claimId, claim }: DarwinWeatherHistoryProps) => {
  const { toast } = useToast();
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchWeatherHistory = async () => {
    if (!claim.loss_date || !claim.policyholder_address) {
      toast({
        title: "Missing information",
        description: "Loss date and address are required for weather lookup",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("darwin-weather-history", {
        body: {
          claimId,
          lossDate: claim.loss_date,
          address: claim.policyholder_address,
          lossType: claim.loss_type,
        },
      });

      if (error) throw error;

      if (data?.weatherData) {
        setWeatherData(data.weatherData);
        setHasSearched(true);
        toast({
          title: "Weather data retrieved",
          description: "Historical weather information has been fetched",
        });
      }
    } catch (error: any) {
      console.error("Error fetching weather:", error);
      toast({
        title: "Weather lookup failed",
        description: error.message || "Could not retrieve weather history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getWeatherIcon = () => {
    if (!weatherData) return <Cloud className="h-5 w-5" />;
    const conditions = weatherData.conditions;
    
    if (conditions.hail_reported) return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    if (conditions.precipitation?.toLowerCase().includes("snow")) return <Snowflake className="h-5 w-5 text-blue-300" />;
    if (conditions.precipitation?.toLowerCase().includes("rain")) return <CloudRain className="h-5 w-5 text-blue-500" />;
    if (conditions.wind_gusts && conditions.wind_gusts > 50) return <Wind className="h-5 w-5 text-gray-500" />;
    return <Sun className="h-5 w-5 text-yellow-500" />;
  };

  const getSeverityBadge = () => {
    if (!weatherData) return null;
    const conditions = weatherData.conditions;
    
    if (conditions.tornado_warning) {
      return <Badge variant="destructive">Tornado Warning</Badge>;
    }
    if (conditions.hail_reported) {
      return <Badge variant="destructive">Hail Reported</Badge>;
    }
    if (conditions.severe_storm_warning) {
      return <Badge className="bg-orange-500">Severe Storm</Badge>;
    }
    if (conditions.wind_gusts && conditions.wind_gusts > 60) {
      return <Badge className="bg-yellow-500 text-black">High Winds</Badge>;
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          Weather History Report
          {getSeverityBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasSearched ? (
          <div className="text-center py-6">
            <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Retrieve historical weather data for the loss date to support your claim
            </p>
            <div className="text-sm text-muted-foreground mb-4">
              <p>Loss Date: {claim.loss_date ? format(new Date(claim.loss_date + 'T00:00:00'), "MMMM d, yyyy") : "Not set"}</p>
              <p>Location: {claim.policyholder_address || "Not set"}</p>
            </div>
            <Button 
              onClick={fetchWeatherHistory} 
              disabled={isLoading || !claim.loss_date || !claim.policyholder_address}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fetching weather data...
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4 mr-2" />
                  Get Weather History
                </>
              )}
            </Button>
          </div>
        ) : weatherData ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {getWeatherIcon()}
                <div>
                  <h4 className="font-medium">{format(new Date(weatherData.date), "MMMM d, yyyy")}</h4>
                  <p className="text-sm text-muted-foreground">{weatherData.location}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchWeatherHistory} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm">{weatherData.summary}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {weatherData.conditions.temperature_high && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <ThermometerSun className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                  <p className="text-xs text-muted-foreground">High</p>
                  <p className="font-medium">{weatherData.conditions.temperature_high}°F</p>
                </div>
              )}
              {weatherData.conditions.temperature_low && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <ThermometerSun className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                  <p className="text-xs text-muted-foreground">Low</p>
                  <p className="font-medium">{weatherData.conditions.temperature_low}°F</p>
                </div>
              )}
              {weatherData.conditions.wind_speed && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <Wind className="h-5 w-5 mx-auto text-gray-500 mb-1" />
                  <p className="text-xs text-muted-foreground">Wind</p>
                  <p className="font-medium">{weatherData.conditions.wind_speed} mph</p>
                </div>
              )}
              {weatherData.conditions.wind_gusts && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <Wind className="h-5 w-5 mx-auto text-red-500 mb-1" />
                  <p className="text-xs text-muted-foreground">Gusts</p>
                  <p className="font-medium">{weatherData.conditions.wind_gusts} mph</p>
                </div>
              )}
            </div>

            {weatherData.conditions.precipitation && (
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-blue-500" />
                <span className="text-sm">{weatherData.conditions.precipitation}</span>
              </div>
            )}

            {weatherData.relevantEvents.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-medium text-sm">Relevant Weather Events</h5>
                <ul className="space-y-1">
                  {weatherData.relevantEvents.map((event, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                      {event}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {weatherData.sources.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Sources: {weatherData.sources.join(", ")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4">No weather data available</p>
        )}
      </CardContent>
    </Card>
  );
};
