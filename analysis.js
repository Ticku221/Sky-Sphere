// This is the "Brain" of our app. It performs all the climate analysis.

function calculateClimateMetrics(historicalData, thresholds) {
    if (!historicalData || historicalData.length === 0) {
        return { error: "No historical data available." };
    }

    let unfavorableYears = 0;
    
    // 1. Loop through each year of historical data
    historicalData.forEach(yearData => {
        let isUnfavorable = false;
        
        // Check if any of the thresholds for the activity were breached
        if (yearData.avg_temp > thresholds.maxTemp) isUnfavorable = true;
        if (yearData.avg_temp < thresholds.minTemp) isUnfavorable = true;
        if (yearData.precipitation_mm > thresholds.maxPrecipitation) isUnfavorable = true;
        if (yearData.wind_speed_mph > thresholds.maxWind) isUnfavorable = true;
        
        if (isUnfavorable) {
            unfavorableYears++;
        }
    });
    
    // 2. Calculate the final probability of unfavorable conditions
    const probability = Math.round((unfavorableYears / historicalData.length) * 100);
    
    // 3. Perform a simple trend analysis
    // We'll just check if the most recent year was hotter than the first year
    let trend = "Stable";
    const firstYearTemp = historicalData[0].avg_temp;
    const lastYearTemp = historicalData[historicalData.length - 1].avg_temp;
    
    if (lastYearTemp > firstYearTemp + 1) { // A noticeable increase
        trend = "Warming Trend";
    } else if (lastYearTemp < firstYearTemp - 1) { // A noticeable decrease
        trend = "Cooling Trend";
    }

    // 4. Create a simple text summary
    let summary = "A low probability of unfavorable weather.";
    if (probability > 60) {
        summary = "A high probability of unfavorable weather. Plan accordingly.";
    } else if (probability > 30) {
        summary = "A moderate probability of unfavorable weather.";
    }
    
    // 5. Return a clean object with all our results
    return {
        probability,
        trend,
        summary
    };
}