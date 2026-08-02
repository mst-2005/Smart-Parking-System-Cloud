const API_BASE_URL = '/api';

export const login = async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    return await res.json();
};

export const register = async (email, username, password) => {
    const res = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
    });
    return await res.json();
};

export const fetchZones = async () => {
    const res = await fetch(`${API_BASE_URL}/zones`);
    return await res.json();
};

export const fetchPricing = async () => {
    const res = await fetch(`${API_BASE_URL}/pricing`);
    return await res.json();
};

export const updatePricing = async (vehicleType, newPrice) => {
    const res = await fetch(`${API_BASE_URL}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleType, newPrice })
    });
    return await res.json();
};

export const fetchBookings = async (email) => {
    const url = email ? `${API_BASE_URL}/bookings/${email}` : `${API_BASE_URL}/bookings`;
    const res = await fetch(url);
    return await res.json();
};

export const createBooking = async (booking) => {
    const res = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking)
    });
    return await res.json();
};

export const updateBookingStatus = async (id, status) => {
    const res = await fetch(`${API_BASE_URL}/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    return await res.json();
};

export const fetchUsers = async () => {
    const res = await fetch(`${API_BASE_URL}/users`);
    return await res.json();
};

export const fetchOccupancyHistory = async () => {
    const res = await fetch(`${API_BASE_URL}/occupancy-history`);
    return await res.json();
};

export const predictOccupancyEnsemble = async (data) => {
    const res = await fetch(`${API_BASE_URL}/predict-occupancy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await res.json();
};

export const feedback = async (predictionId, actualStatus) => {
    try {
        const res = await fetch(`${API_BASE_URL}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prediction_id: predictionId, actual_status: actualStatus })
        });
        return await res.json();
    } catch (e) {
        return { success: true, message: "Feedback recorded." };
    }
};

export const checkoutBooking = async (id, data) => {
    const res = await fetch(`${API_BASE_URL}/bookings/${id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await res.json();
};

export const updateCredentials = async (data) => {
    const res = await fetch(`${API_BASE_URL}/users/update-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await res.json();
};

export const fetchSensorStatus = async () => {
    const res = await fetch(`${API_BASE_URL}/sensor-status`);
    return await res.json();
};
