import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Standard fix to allow __dirname in modern JavaScript (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' folder

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- SECURE API ENDPOINTS ---

// Gemini AI Assistant Proxy
app.post('/api/chat', async (req, res) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) { return res.status(500).json({ error: 'Gemini API key not configured.' }); }
    
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const { userPrompt, weatherData } = req.body;
        const fullPrompt = `You are an AI Weather Assistant. Based on this data: ${JSON.stringify(weatherData)}, answer the user's question: "${userPrompt}"`;
        const result = await model.generateContent(fullPrompt);
        res.json({ reply: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get a response from the AI.' });
    }
});

// OpenWeatherMap Proxy for current weather
app.get('/api/weather/:city', async (req, res) => {
    const OPENWEATHERMAP_KEY = process.env.OPENWEATHERMAP_KEY;
    if (!OPENWEATHERMAP_KEY) { return res.status(500).json({ error: 'OpenWeatherMap API key not configured.' }); }

    try {
        const city = req.params.city;
        
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${OPENWEATHERMAP_KEY}`;
        const geoResponse = await fetch(geoUrl);
        const geoData = await geoResponse.json();
        if (geoData.length === 0) return res.status(404).json({ error: 'City not found.' });
        const { lat, lon } = geoData[0];

        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_KEY}&units=metric`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_KEY}&units=metric`;
        const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_KEY}`;

        const [weatherResponse, forecastResponse, aqiResponse] = await Promise.all([
            fetch(weatherUrl), fetch(forecastUrl), fetch(aqiUrl)
        ]);
        
        const current = await weatherResponse.json();
        const forecast = await forecastResponse.json();
        const aqi = await aqiResponse.json();

        res.json({ current, forecast, aqi, coords: { lat, lon } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch weather data.' });
    }
});

// --- NEW MODIFIED ENDPOINT ---
// Open-Meteo Proxy for historical data by City Name
app.get('/api/historical/:city', async (req, res) => {
    const OPENWEATHERMAP_KEY = process.env.OPENWEATHERMAP_KEY;
    if (!OPENWEATHERMAP_KEY) { return res.status(500).json({ error: 'OpenWeatherMap API key not configured.' }); }

    try {
        // --- Part 1: Geocode the city name to get coordinates ---
        const city = req.params.city;
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city}&limit=1&appid=${OPENWEATHERMAP_KEY}`;
        const geoResponse = await fetch(geoUrl);
        const geoData = await geoResponse.json();

        // If city is not found, return a 404 error
        if (geoData.length === 0) {
            return res.status(404).json({ error: 'City not found.' });
        }
        const { lat, lon } = geoData[0];

        // --- Part 2: Fetch historical data using the coordinates ---
        const { date } = req.query; // Get the date from the query string
        if (!date) {
            return res.status(400).json({ error: 'Date query parameter is required.' });
        }
        
        const targetDate = new Date(date);
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        
        // Fetch 30 years of data for accurate percentiles
        const startDate = `${new Date().getFullYear() - 30}-${month}-${day}`;
        const endDate = `${new Date().getFullYear() - 1}-${month}-${day}`;

        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,precipitation_sum,wind_speed_10m_max&timezone=auto`;
        const historicalResponse = await fetch(url);

        if (!historicalResponse.ok) {
            throw new Error('Failed to fetch from Open-Meteo');
        }

        const historicalData = await historicalResponse.json();
        res.json(historicalData);

    } catch (error) {
        console.error(error); // Log the actual error for debugging
        res.status(500).json({ error: 'Failed to fetch historical weather data.' });
    }
});


// --- OLD ENDPOINT (NOW COMMENTED OUT) ---
/*
app.get('/api/historical', async (req, res) => {
    try {
        const { lat, lon, date } = req.query;
        const targetDate = new Date(date);
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        
        // Fetch 30 years of data for accurate percentiles
        const startDate = `${new Date().getFullYear() - 30}-${month}-${day}`;
        const endDate = `${new Date().getFullYear() - 1}-${month}-${day}`;

        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,precipitation_sum,wind_speed_10m_max&timezone=auto`;
        const historicalResponse = await fetch(url);
        if (!historicalResponse.ok) throw new Error('Failed to fetch from Open-Meteo');
        const historicalData = await historicalResponse.json();
        res.json(historicalData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch historical data.' });
    }
});
*/

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});