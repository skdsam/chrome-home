class WeatherManager {
    constructor() {
        this.apiUrl = 'https://api.open-meteo.com/v1/forecast';
    }

    async init() {
        try {
            // Check for manual location override first
            const storage = await window.storageManager.get('manualLocation');

            let lat, lon, name;

            if (storage.manualLocation) {
                lat = storage.manualLocation.lat;
                lon = storage.manualLocation.lon;
                name = storage.manualLocation.name;
            } else {
                const position = await this.getPosition();
                lat = position.coords.latitude;
                lon = position.coords.longitude;
                // Fetch name if auto
                name = await this.fetchLocationName(lat, lon);
            }

            const weather = await this.fetchWeather(lat, lon);
            this.applyWeather(weather, name, lat, lon);
            document.getElementById('weather-display').classList.remove('hidden');
        } catch (error) {
            console.error("Weather Error:", error);
            document.getElementById('weather-icon').textContent = '⚠️';
            document.getElementById('weather-temp').textContent = 'Location Off';
        }
    }

    async setManualLocation(cityQuery) {
        if (!cityQuery) {
            // Clear manual location to revert to auto
            await window.storageManager.remove('manualLocation');
            this.init();
            return;
        }

        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1&language=en&format=json`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const locationData = {
                    name: result.name,
                    lat: result.latitude,
                    lon: result.longitude
                };
                await window.storageManager.set({
                    manualLocation: locationData
                });
                this.init(); // Reload
            } else {
                alert('City not found. Please try again.');
            }
        } catch (error) {
            console.error("Geocoding Error:", error);
            alert('Error fetching city data.');
        }
    }

    getPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
    }

    async fetchLocationName(lat, lon) {
        try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            const data = await res.json();
            // Try to find the most relevant name
            return data.city || data.locality || data.principalSubdivision || "Unknown";
        } catch (e) {
            console.warn("Location fetch failed", e);
            return "";
        }
    }

    async fetchWeather(lat, lon) {
        // Fetch current weather and sunrise/sunset for day/night detection
        const url = `${this.apiUrl}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto`;
        const res = await fetch(url);
        return await res.json();
    }

    async applyWeather(data, locationName, lat, lon) {
        const current = data.current;
        const code = current.weather_code;
        const isDay = current.is_day === 1;
        const temp = Math.round(current.temperature_2m);

        const container = document.getElementById('bg-container');
        const effects = document.getElementById('weather-effects');
        const iconEl = document.getElementById('weather-icon');
        const tempEl = document.getElementById('weather-temp');

        // Check background config
        const bgStored = await window.storageManager.get('bgConfig');
        const bgType = (bgStored.bgConfig && bgStored.bgConfig.type) || 'weather';

        // Reset
        if (bgType === 'weather') {
            container.className = 'background-container';
        }
        effects.innerHTML = '';

        let baseState = 'clear';
        let icon = isDay ? '☀️' : '🌙';

        // WMO Code Interpretation
        if (code <= 1) {
            baseState = 'clear';
            icon = isDay ? '☀️' : '🌙';
        } else if (code <= 3) {
            baseState = 'clouds';
            icon = isDay ? '⛅' : '☁️';
        } else if (code >= 45 && code <= 48) {
            baseState = 'clouds'; // Fog
            icon = '🌫️';
        } else if (code >= 51 && code <= 67) {
            baseState = 'rain';
            icon = '🌧️';
            this.createRain(effects);
        } else if (code >= 71 && code <= 86) {
            baseState = 'snow';
            icon = '❄️';
            this.createSnow(effects);
        } else if (code >= 95) {
            baseState = 'rain'; // Storm
            icon = '⚡';
            this.createRain(effects);
        } else {
            baseState = 'clouds';
            icon = '🌫️';
        }

        const timeSuffix = isDay ? '-day' : '-night';
        const finalState = `weather-${baseState}${timeSuffix}`;

        if (bgType === 'weather') {
            container.classList.add(finalState);
        }
        iconEl.textContent = icon;

        // Display: "City, 20°C" or just "20°C" if city fails
        if (locationName) {
            tempEl.textContent = `${locationName}, ${temp}°C`;
        } else {
            tempEl.textContent = `${temp}°C`;
        }
    }

    createRain(container) {
        const count = 100;
        for (let i = 0; i < count; i++) {
            const drop = document.createElement('div');
            drop.className = 'rain-drop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
            drop.style.animationDelay = Math.random() * 2 + 's';
            container.appendChild(drop);
        }
    }

    createSnow(container) {
        const count = 50;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement('div');
            flake.className = 'snow-flake';
            flake.style.left = Math.random() * 100 + 'vw';
            flake.style.width = flake.style.height = (Math.random() * 5 + 2) + 'px';
            flake.style.opacity = Math.random();
            flake.style.animationDuration = (3 + Math.random() * 2) + 's';
            flake.style.animationDelay = Math.random() * 5 + 's';
            container.appendChild(flake);
        }
    }
}
window.WeatherManager = WeatherManager;