document.addEventListener('DOMContentLoaded', () => {
    // --- STATE & CONSTANTS ---
    let appCoords = null;
    // REMOVED: Redundant plannerCoords state. The new API doesn't require a separate geocoding step.
    // let plannerCoords = null; 
    let currentCity = null;
    let hourlyChart = null;
    let plannerChart = null;
    let radarMap = null;
    let isMapInitialized = false;
    let lastHistoricalData = null; // Store the last fetched historical data for download

    // --- ELEMENT SELECTORS (with Pre-flight Check) ---
    const getElement = (id) => {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`CRITICAL ERROR: HTML element with id="${id}" is missing. App cannot start.`);
        }
        return element;
    };
    
    // This function ensures all required elements are in the HTML before the script runs.
    const runPreFlightCheck = () => {
        const requiredElementIds = [
            'search-form', 'search-input', 'app-container', 'city-name', 'weather-description',
            'temperature', 'rain-chance', 'feels-like', 'min-max-temp', 'weather-details',
            'daily-forecast-container', 'hourly-chart', 'chatbot-messages', 'chatbot-form', 
            'chatbot-input', 'planner-card', 'planner-inputs', 'planner-results', 
            'vibe-options', 'planner-date', 'analyze-btn', 'planner-search-input', 'planner-search-btn'
        ];
        requiredElementIds.forEach(getElement);
    };
    runPreFlightCheck();
    
    // Select all elements now that we know they exist
    const searchForm = getElement('search-form');
    const searchInput = getElement('search-input');
    const appContainer = getElement('app-container');
    const cityNameEl = getElement('city-name');
    const weatherDescEl = getElement('weather-description');
    const tempEl = getElement('temperature');
    const rainChanceEl = getElement('rain-chance').querySelector('span');
    const feelsLikeEl = getElement('feels-like');
    const minMaxTempEl = getElement('min-max-temp');
    const weatherDetailsContainer = getElement('weather-details');
    const dailyForecastContainer = getElement('daily-forecast-container');
    const chatbotMessages = getElement('chatbot-messages');
    const chatbotForm = getElement('chatbot-form');
    const chatbotInput = getElement('chatbot-input');
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');
    const plannerCard = getElement('planner-card');
    const plannerInputs = getElement('planner-inputs');
    const plannerResults = getElement('planner-results');
    const vibeOptionsContainer = getElement('vibe-options');
    const plannerDateInput = getElement('planner-date');
    const analyzeBtn = getElement('analyze-btn');
    const plannerSearchInput = getElement('planner-search-input');
    const plannerSearchBtn = getElement('planner-search-btn');

    // --- CORE DATA FETCHING ---
    const fetchDataForCity = async (city) => {
        try {
            const response = await fetch(`/api/weather/${city}`);
            if (!response.ok) {
                const err = await response.json(); throw new Error(err.error || 'Weather data not found.');
            }
            const data = await response.json();
            appCoords = data.coords;
            currentCity = data.current.name;
            updateUI(data.current, data.forecast, data.aqi);
            if (isMapInitialized) { radarMap.setView([appCoords.lat, appCoords.lon], 10); }
        } catch (error) { alert(error.message); }
    };

    // --- LONG-RANGE PLANNER ---

    // REMOVED: The handlePlannerSearch function is no longer needed.
    // The main analysis function will handle the city name directly.

    const updateAnalyzeButtonState = () => {
        const selectedVibe = vibeOptionsContainer.querySelector('.active');
        const selectedDate = plannerDateInput.value;
        const plannerCity = plannerSearchInput.value.trim();
        // CHANGED: The button is now enabled based on the city input field having text, not a `plannerCoords` object.
        analyzeBtn.disabled = !(selectedVibe && selectedDate && plannerCity);
    };

    const runClimateAnalysis = async () => {
        const selectedVibe = vibeOptionsContainer.querySelector('.active')?.dataset.vibe;
        const selectedDate = plannerDateInput.value;
        // CHANGED: Get the city name directly from the input field.
        const city = plannerSearchInput.value.trim();

        if (!selectedVibe || !selectedDate || !city) return;

        plannerInputs.classList.add('hidden');
        plannerResults.classList.remove('hidden');
        plannerResults.innerHTML = `<p>Analyzing 30 years of climate data for ${city}...</p>`;
        
        try {
            // --- MAJOR CHANGE ---
            // CHANGED: The fetch call now uses the new, simplified endpoint `/api/historical/:city`.
            // It sends the city name in the URL and the date as a query parameter.
            // No separate geocoding step is required.
            const response = await fetch(`/api/historical/${city}?date=${selectedDate}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Could not fetch historical data.`);
            }
            
            const historicalData = await response.json();
            lastHistoricalData = historicalData.daily;
            const results = calculateClimateMetrics(historicalData.daily, selectedVibe);
            renderAnalysisReport(results);
        } catch (error) {
            plannerResults.innerHTML = `<p>Sorry, an error occurred: ${error.message}</p><button class="back-btn">Try Again</button>`;
            plannerResults.querySelector('.back-btn').onclick = showPlannerInputs;
        }
    };

    const calculateClimateMetrics = (dailyData, vibe) => {
        if (!dailyData || !dailyData.time || dailyData.time.length < 10) {
            return { riskScore: 'N/A', summary: 'Insufficient historical data for a reliable analysis.', insights: {}, historicalTemps: [] };
        }

        const temps = dailyData.temperature_2m_max.filter(t => t !== null).sort((a, b) => a - b);
        const p90_temp = temps[Math.floor(temps.length * 0.9)];
        
        const insights = {
            chanceOfExtremeHeat: (dailyData.temperature_2m_max.filter(t => t > p90_temp).length / dailyData.time.length) * 100,
            chanceOfRain: (dailyData.precipitation_sum.filter(r => r > 1).length / dailyData.time.length) * 100,
        };

        let riskScore = 0;
        if (vibe === "Beach Day") { riskScore = (insights.chanceOfRain * 0.7) + (insights.chanceOfExtremeHeat * 0.2); }
        else if (vibe === "Hiking Trip") { riskScore = (insights.chanceOfRain * 0.4) + (insights.chanceOfExtremeHeat * 0.6); }
        else { riskScore = (insights.chanceOfRain * 0.8) + (insights.chanceOfExtremeHeat * 0.2); }
        riskScore = Math.min(Math.round(riskScore), 100);

        // DYNAMIC SUMMARY GENERATION
        let summary = `Historically, this looks like a great day for a ${vibe.toLowerCase()}. Conditions appear favorable.`;
        if (riskScore > 65) {
            summary = vibe === "Beach Day" 
                ? `HIGH RISK. Historically, there's a strong chance of rain or storms. Maybe pack an umbrella instead of sunscreen? ⛈️`
                : `HIGH RISK. There's a significant chance of disruptive weather for a ${vibe.toLowerCase()}. A backup plan is strongly advised.`;
        } else if (riskScore > 35) {
            summary = vibe === "Hiking Trip"
                ? `MODERATE RISK. The weather is a real gamble on this day. Be prepared for anything from sun to a sudden downpour. Pack layers! 🌦️`
                : `MODERATE RISK. While you might get a good day, be prepared for a notable chance of challenging conditions for your ${vibe.toLowerCase()}.`;
        }
        
        return { riskScore, summary, insights, p90_temp, historicalTemps: temps };
    };

    const renderAnalysisReport = (results) => {
        const riskColor = results.riskScore > 65 ? '#ef4444' : results.riskScore > 35 ? '#f59e0b' : '#10b981';
        
        plannerResults.innerHTML = `
            <div class="briefing-header">
                <h3 class="briefing-title">Climate Briefing</h3>
                <button class="back-btn">New Analysis</button>
            </div>
            <div class="risk-dial">
                <div class="risk-score" style="color: ${riskColor};">${results.riskScore}</div>
                <div class="risk-label">Vibe-Adjusted Risk Score</div>
            </div>
            <div class="briefing-summary">${results.summary}</div>
            <div class="briefing-insights">
                <h3>Key Insights (Objective Facts)</h3>
                <div class="insight-grid">
                    <div class="insight-item">
                        <div class="insight-label">Chance of Extreme Heat (> ${results.p90_temp.toFixed(1)}°C)</div>
                        <div class="insight-value">${results.insights.chanceOfExtremeHeat.toFixed(0)}%</div>
                    </div>
                    <div class="insight-item">
                        <div class="insight-label">Chance of Any Rain (>1mm)</div>
                        <div class="insight-value">${results.insights.chanceOfRain.toFixed(0)}%</div>
                    </div>
                </div>
            </div>
            <div class="briefing-chart">
                <h3>30-Year Temperature Range (°C)</h3>
                <canvas id="planner-chart"></canvas>
            </div>
            <button id="download-data-btn" class="download-report-btn">
                <i class="fa-solid fa-download"></i> Download Raw Data
            </button>
        `;
        renderPlannerChart(lastHistoricalData);
        plannerResults.querySelector('.back-btn').onclick = showPlannerInputs;
        plannerResults.querySelector('#download-data-btn').onclick = () => {
            const selectedDate = plannerDateInput.value;
            downloadDataAsCSV(lastHistoricalData, plannerSearchInput.value.split(',')[0], selectedDate);
        };
        plannerResults.classList.add('slide-in');
    };
    
    const showPlannerInputs = () => {
        plannerResults.classList.add('hidden');
        plannerInputs.classList.remove('hidden');
    };

    const renderPlannerChart = (historicalData) => {
        if (plannerChart) plannerChart.destroy();
        const ctx = document.getElementById('planner-chart');
        if (!ctx || !historicalData) return;
        
        const temps = historicalData.temperature_2m_max.filter(t => t !== null);
        if (temps.length === 0) return;
        const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
        
        plannerChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Historical Max Temp'],
                datasets: [{
                    label: 'Temp Range',
                    data: [[Math.min(...temps), Math.max(...temps)]],
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    borderWidth: 1,
                    barPercentage: 0.3,
                    borderSkipped: false,
                    borderRadius: 4,
                }, {
                    label: '30-Year Average',
                    data: [avgTemp],
                    type: 'scatter',
                    backgroundColor: '#007aff',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === 'Temp Range') {
                                return ` Range: ${Math.min(...temps).toFixed(1)}°C to ${Math.max(...temps).toFixed(1)}°C`;
                            }
                            return ` Average: ${avgTemp.toFixed(1)}°C`;
                        }
                    }
                }},
                scales: { x: { ticks: { color: 'rgba(255,255,255,0.7)' } }, y: { display: false } }
            }
        });
    };
    
    const downloadDataAsCSV = (historicalData, cityName, date) => {
        if (!historicalData) { alert('No data to download.'); return; }
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Year,Max_Temperature_C,Precipitation_mm,Max_Wind_Speed_kmh\r\n";

        historicalData.time.forEach((time, index) => {
            const year = new Date(time).getFullYear();
            const temp = historicalData.temperature_2m_max[index];
            const precip = historicalData.precipitation_sum[index];
            const wind = historicalData.wind_speed_10m_max[index];
            csvContent += `${year},${temp ?? 'N/A'},${precip ?? 'N/A'},${wind ?? 'N/A'}\r\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Climate_Report_${cityName}_${date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- ORIGINAL UI & CHATBOT FUNCTIONS ---
    const updateUI = (current, forecast, aqiData) => {
        appContainer.className = 'weather-app ' + current.weather[0].main.toLowerCase();
        cityNameEl.textContent = current.name;
        weatherDescEl.textContent = current.weather[0].description;
        tempEl.textContent = Math.round(current.main.temp);
        feelsLikeEl.textContent = `Feels like: ${Math.round(current.main.feels_like)}°`;
        minMaxTempEl.textContent = `H: ${Math.round(current.main.temp_max)}° L: ${Math.round(current.main.temp_min)}°`;
        rainChanceEl.textContent = `${Math.round(forecast.list[0].pop * 100)}%`;
        const aqiText = ['Good','Fair','Moderate','Poor','Very Poor'][aqiData.list[0].main.aqi - 1];
        weatherDetailsContainer.innerHTML = `<div class="detail-item"><i class="fa-solid fa-wind"></i><div><p>Wind</p><p>${current.wind.speed} km/h</p></div></div><div class="detail-item"><i class="fa-solid fa-droplet"></i><div><p>Humidity</p><p>${current.main.humidity}%</p></div></div><div class="detail-item"><i class="fa-solid fa-smog"></i><div><p>AQI</p><p>${aqiText}</p></div></div>`;
        renderHourlyChart(forecast.list);
        render5DayForecast(forecast.list);
        chatbotMessages.innerHTML = ''; addBotMessage("Ask me about today's weather!");
    };
    const renderHourlyChart = (hourlyData) => {
        if (hourlyChart) hourlyChart.destroy();
        const ctx = document.getElementById('hourly-chart'); if (!ctx) return;
        const labels = hourlyData.slice(0, 8).map(item => new Date(item.dt * 1000).toLocaleTimeString([], { hour: 'numeric' }));
        const temps = hourlyData.slice(0, 8).map(item => item.main.temp);
        hourlyChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Temp (°C)', data: temps, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', tension: 0.4, fill: true }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: 'rgba(255,255,255,0.8)' } }, y: { display: false } } } });
    };
    const render5DayForecast = (forecastList) => {
        dailyForecastContainer.innerHTML = ''; const dailyData = {};
        forecastList.forEach(item => { const date = item.dt_txt.split(' ')[0]; if (!dailyData[date]) dailyData[date] = { icons: [], pops: [] }; dailyData[date].icons.push(item.weather[0].icon); dailyData[date].pops.push(item.pop); });
        Object.keys(dailyData).slice(1, 6).forEach(date => { const dayInfo = dailyData[date]; const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' }); const iconCode = dayInfo.icons[Math.floor(dayInfo.icons.length / 2)] || dayInfo.icons[0]; const maxPop = Math.round(Math.max(...dayInfo.pops) * 100); const item = document.createElement('div'); item.className = 'daily-forecast-item'; item.innerHTML = `<span class="day-name">${dayName}</span><img src="https://openweathermap.org/img/wn/${iconCode}.png" alt="weather icon" class="weather-icon"><span class="rain-chance-daily"><i class="fa-solid fa-droplet" style="opacity: 0.7;"></i> ${maxPop}%</span>`; dailyForecastContainer.appendChild(item); });
    };
    const initRadarMap = (lat, lon) => {
        const OPENWEATHERMAP_KEY = "3c6646a740f759882bd325712472eca9";
        radarMap = L.map('page-map').setView([lat, lon], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(radarMap);
        L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHERMAP_KEY}`).addTo(radarMap);
    };
    const addBotMessage = (text) => { chatbotMessages.querySelector('.bot-typing')?.remove(); const botMessage = document.createElement('div'); botMessage.className = 'chat-bubble bot-message'; botMessage.innerHTML = text; chatbotMessages.appendChild(botMessage); chatbotMessages.scrollTop = chatbotMessages.scrollHeight; };
    const handleUserInput = async (text) => { const userMessage = document.createElement('div'); userMessage.className = 'chat-bubble user-message'; userMessage.textContent = text; chatbotMessages.appendChild(userMessage); const typingIndicator = document.createElement('div'); typingIndicator.className = 'chat-bubble bot-message bot-typing'; typingIndicator.textContent = '...'; chatbotMessages.appendChild(typingIndicator); chatbotMessages.scrollTop = chatbotMessages.scrollHeight; try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userPrompt: text, weatherData: { city: currentCity }}) }); if (!response.ok) throw new Error('AI service unavailable.'); const data = await response.json(); addBotMessage(data.reply); } catch (error) { addBotMessage("Sorry, I'm having trouble connecting to my AI brain."); } };
    
    // --- EVENT LISTENERS ---
    searchForm.addEventListener('submit', (e) => { e.preventDefault(); if (searchInput.value) fetchDataForCity(searchInput.value); });
    navButtons.forEach(button => { button.addEventListener('click', () => { const targetPageId = button.dataset.page; navButtons.forEach(btn => btn.classList.remove('active')); button.classList.add('active'); pages.forEach(page => page.classList.toggle('active', page.id === targetPageId)); if (targetPageId === 'page-map' && !isMapInitialized && appCoords) { initRadarMap(appCoords.lat, appCoords.lon); isMapInitialized = true; } }); });
    vibeOptionsContainer.querySelectorAll('.vibe-btn').forEach(btn => {btn.onclick = () => { vibeOptionsContainer.querySelector('.active')?.classList.remove('active'); btn.classList.add('active'); updateAnalyzeButtonState(); }; });
    plannerDateInput.onchange = updateAnalyzeButtonState;
    analyzeBtn.addEventListener('click', runClimateAnalysis);
    
    // CHANGED: Removed listeners for the old, redundant search functionality.
    // The search button no longer needs to do anything, and the input field now updates the button state on its own.
    plannerSearchBtn.addEventListener('click', (e) => e.preventDefault()); // Prevent default behavior
    plannerSearchInput.addEventListener('input', updateAnalyzeButtonState);

    chatbotForm.addEventListener('submit', (e) => { e.preventDefault(); if (chatbotInput.value) { handleUserInput(chatbotInput.value); chatbotInput.value = ''; } });
    
    // --- INITIAL APP LOAD ---
    fetchDataForCity('Jabalpur');
});