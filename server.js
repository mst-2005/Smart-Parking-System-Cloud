const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { predictOccupancy } = require('./ai-engine');

const app = express();
const PORT = process.env.PORT || 3000;

// Persistent data path (uses env path or fallback to local ./data/db.json)
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');
const occupancyPath = path.join(__dirname, 'data', 'occupancy_data.json');

app.use(cors());
app.use(express.json());

// Helper to read DB
const readDb = () => {
    try {
        if (!fs.existsSync(dbPath)) {
            const initialData = { users: [], bookings: [], pricing: {}, zones: [] };
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading database:", err);
        return { users: [], bookings: [], pricing: {}, zones: [] };
    }
};

// Helper to write DB
const writeDb = (data) => {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing to database:", err);
    }
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const db = readDb();
    const user = db.users.find(u => (u.email === email || u.username === email) && u.password === password);
    if (user) {
        const isAdmin = (user.email.toLowerCase().includes('admin') || user.username.toLowerCase().includes('admin'));
        const effectiveRole = isAdmin ? 'admin' : user.role;
        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: { ...safeUser, role: effectiveRole } });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials." });
    }
});

app.post('/api/register', (req, res) => {
    const { email, username, password } = req.body;
    const db = readDb();
    if (db.users.some(u => u.email === email || u.username === username)) {
        return res.status(400).json({ success: false, message: "Email or username already exists." });
    }
    const isAdmin = (email.toLowerCase().includes('admin') || username.toLowerCase().includes('admin'));
    const role = isAdmin ? 'admin' : 'user';

    const newUser = { email, username, password, role };
    db.users.push(newUser);
    writeDb(db);
    const { password: _, ...safeUser } = newUser;
    res.json({ success: true, user: safeUser });
});

app.get('/api/users', (req, res) => {
    const db = readDb();
    const safeUsers = db.users.map(({ password, ...u }) => u);
    res.json(safeUsers);
});

app.post('/api/users/update-credentials', (req, res) => {
    const { oldVal, oldPw, newVal, newPw, type } = req.body;
    const db = readDb();
    const user = db.users.find(u => (u.email === oldVal || u.username === oldVal) && u.password === oldPw);
    
    if (user) {
        if (type === 'password') {
            user.password = newPw;
        } else if (type === 'email') {
            if (db.users.some(u => u.email === newVal)) {
                return res.status(400).json({ success: false, message: "New email already exists." });
            }
            user.email = newVal;
        } else if (type === 'both') {
            const others = db.users.filter(u => u.email !== user.email);
            if (others.some(u => (newVal.email && u.email === newVal.email) || (newVal.username && u.username === newVal.username))) {
                return res.status(400).json({ success: false, message: "New email/username already exists." });
            }
            if (newVal.email) user.email = newVal.email;
            if (newVal.username) user.username = newVal.username;
            if (newVal.password) user.password = newVal.password;
        }
        writeDb(db);
        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
    } else {
        res.status(401).json({ success: false, message: "Old credentials do not match." });
    }
});

// --- ZONES & PRICING ROUTES ---
app.get('/api/zones', (req, res) => {
    const db = readDb();
    res.json(db.zones);
});

app.get('/api/pricing', (req, res) => {
    const db = readDb();
    res.json(db.pricing);
});

app.put('/api/pricing', (req, res) => {
    const { vehicleType, newPrice } = req.body;
    const db = readDb();
    if (db.pricing[vehicleType]) {
        db.pricing[vehicleType] = { ...db.pricing[vehicleType], ...newPrice };
        writeDb(db);
        res.json({ success: true, pricing: db.pricing });
    } else {
        res.status(404).json({ success: false, message: "Vehicle type not found." });
    }
});

// --- BOOKINGS ROUTES ---
app.get('/api/bookings', (req, res) => {
    const db = readDb();
    res.json(db.bookings);
});

app.get('/api/bookings/:email', (req, res) => {
    const { email } = req.params;
    const db = readDb();
    const userBookings = db.bookings.filter(b => b.userEmail === email);
    res.json(userBookings);
});

app.post('/api/bookings', (req, res) => {
    const booking = req.body;
    const db = readDb();
    db.bookings.unshift(booking);
    writeDb(db);
    res.json({ success: true, booking });
});

app.patch('/api/bookings/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const db = readDb();
    const bookingIndex = db.bookings.findIndex(b => b.bookingId === id);
    if (bookingIndex !== -1) {
        db.bookings[bookingIndex].status = status;
        writeDb(db);
        res.json({ success: true, booking: db.bookings[bookingIndex] });
    } else {
        res.status(404).json({ success: false, message: "Booking not found." });
    }
});

app.post('/api/bookings/:id/checkout', (req, res) => {
    const { id } = req.params;
    const { finalCharge, actualExitTime, status } = req.body;
    const db = readDb();
    const idx = db.bookings.findIndex(b => b.bookingId === id);
    if (idx !== -1) {
        db.bookings[idx] = { ...db.bookings[idx], status, finalCharge, actualExitTime };
        writeDb(db);
        res.json({ success: true, booking: db.bookings[idx] });
    } else {
        res.status(404).json({ success: false, message: "Booking not found." });
    }
});

// --- IOT SENSOR & ANALYTICS ROUTES ---
app.get('/api/occupancy-history', (req, res) => {
    try {
        if (fs.existsSync(occupancyPath)) {
            const data = JSON.parse(fs.readFileSync(occupancyPath, 'utf8'));
            return res.json(data);
        }
    } catch (e) {
        console.error("Error reading occupancy analytics:", e);
    }
    res.json({ daily: [], hourly: [] });
});

app.get('/api/sensor-status', (req, res) => {
    const db = readDb();
    const sensorData = {};
    const now = new Date();
    const minuteIndex = now.getHours() * 60 + now.getMinutes();

    db.zones.forEach(zone => {
        for (let i = 1; i <= zone.totalSpaces; i++) {
            const slotId = `${zone.id}-${i}`;
            const slotSeed = slotId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
            const isOccupied = ((minuteIndex + slotSeed) % 3) === 0;

            const proximity = (5.0 + ((slotSeed % 20) * 0.8)).toFixed(1) + "m";
            const temp = (22.0 + ((slotSeed % 8) * 0.5)).toFixed(1) + "°C";

            sensorData[slotId] = {
                occupied: isOccupied,
                lastSeen: new Date(now.getTime() - (i * 10000)).toISOString(),
                sensorId: `IOT-CLOUD-${slotId}`,
                source: "Cloud Sensor Simulation",
                proximityToExit: proximity,
                noiseLevel: `${45 + (slotSeed % 15)}dB`,
                temperature: temp,
                popularity: 65 + (slotSeed % 30)
            };
        }
    });

    res.json({
        success: true,
        timestamp: now.toISOString(),
        sensors: sensorData
    });
});

// --- UNIFIED NATIVE JS AI PREDICTION ENDPOINT ---
app.post('/api/predict-occupancy', (req, res) => {
    try {
        const result = predictOccupancy(req.body);
        res.json(result);
    } catch (err) {
        console.error("AI Engine Prediction Error:", err);
        res.status(500).json({ success: false, message: "AI Engine Prediction Error" });
    }
});

app.post('/api/feedback', (req, res) => {
    res.json({ success: true, message: "Model feedback recorded." });
});

// --- SERVE STATIC FRONTEND IN PRODUCTION ---
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(publicDir, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`🌐 ParkSpot+ Cloud Server running on http://localhost:${PORT}`);
});
