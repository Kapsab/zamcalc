let map;
let measurePoints = [];
let measureLine = null;

function initMap() {
	//---- Leaflet web map ----//
	map = L.map('map', { zoomControl: false }).setView([-14.82563, 28.54925], 6);
	L.control.zoom ({ position: 'topright' }).addTo(map);
	L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '&copy OpenStreetMap'
	}).addTo(map);
	addMapCustomControls();
	
	map.on('click', function(e) {
		if (window.isMeasuring) {
			measurePoints.push(e.latlng);
		
			if (measurePoints.length === 1) {
		    	document.getElementById('status_text').innerText = "First point set. Click second point.";
			} else if (measurePoints.length === 2) {
		    	const p1 = measurePoints[0];
		    	const p2 = measurePoints[1];

		    	// 1. Calculate Distance (Meters)
		    	const dist = map.distance(p1, p2);

				// 2. Calculate Bearing (True North)
				// Standard formula: atan2(sin(Δλ)⋅cos(φ2), cos(φ1)⋅sin(φ2) − sin(φ1)⋅cos(φ2)⋅cos(Δλ))
				const rad = Math.PI / 180;
				const lat1 = p1.lat * rad, lat2 = p2.lat * rad;
				const lon1 = p1.lng * rad, lon2 = p2.lng * rad;
				const dLon = lon2 - lon1;
				const y = Math.sin(dLon) * Math.cos(lat2);
				const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
				let brg = Math.atan2(y, x) * (180 / Math.PI);
				brg = (brg + 360) % 360; // Normalize to 0-360

				// 3. Draw the line
				if (typeof measureLine !== 'undefined' && measureLine) map.removeLayer(measureLine);
				measureLine = L.polyline([p1, p2], { color: 'var(--accent-gold)', weight: 3, dashArray: '5, 10' }).addTo(map);

				// 4. Update Status
				const result = `Join: ${dist.toFixed(3)}m @ ${COGO.degToDms(brg)}`;
				document.getElementById('status_text').innerText = result;
				
				// Reset for next measurement
				measurePoints = [];
			}
		}
	});
}

async function renderMapPoints() {
    try {
        const response = await fetch('/api/map-points', { credentials: 'include' });
        const incomingData = await response.json();

        // 1. Silent safeguard if the request was made pre-authentication
        if (incomingData && incomingData.error && incomingData.error.includes("Unauthorized")) {
            console.log("Map: Waiting for user authentication before rendering points...");
            return; 
        }

        // 🔍 DIAGNOSTIC LOGGING
        console.log("Data packet received by map engine:", incomingData);

        let geojsonData;

        // 2. SMART PARSING: Check if the backend already wrapped it as a FeatureCollection
        if (incomingData && incomingData.type === 'FeatureCollection') {
            // Data is already perfect GeoJSON! Use it directly.
            geojsonData = incomingData;
        } else if (Array.isArray(incomingData)) {
            // Data came as a raw database array: map it into GeoJSON format manually
            geojsonData = {
                type: "FeatureCollection",
                features: incomingData.map(row => ({
                    type: "Feature",
                    geometry: row.location || row.geometry,
                    properties: {
                        id: row.id,
                        pt_no: row.pt_no
                    }
                }))
            };
        } else {
            console.error("Map: Received an unrecognized coordinate data format profile:", incomingData);
            return;
        }

        // 3. Clear old map markers layer if it exists from a previous render pass
        if (window.mapLayer) {
            map.removeLayer(window.mapLayer);
        }

        // 4. Draw the 464 points visually on your Leaflet map viewport layout
        window.mapLayer = L.geoJSON(geojsonData, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 5,
                    fillColor: "#c2a172", // Your brand gold accent color
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.pt_no) {
                    layer.bindTooltip(`ID: ${feature.properties.pt_no}`, {
                        permanent: false,
                        direction: 'top',
                        offset: [0, -10]
                    });
                }
            }
        }).addTo(map);

        // 5. Automatically focus and zoom the map camera view center to fit all 464 points perfectly
        zoomToAllPoints();

    } catch (err) {
        console.error("Map render engine error:", err);
    }
}


function zoomToAllPoints() {
    // Check if the map layer exists and has features
    if (window.mapLayer && window.mapLayer.getLayers().length > 0) {
        const bounds = window.mapLayer.getBounds();
        
        // Ensure there is more than one point, otherwise fitBounds zooms too far in
        if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
            // Only one point: center on it with a fixed zoom level
            map.flyTo(bounds.getCenter(), 16);
        } else {
            // Multiple points: zoom to fit all with some padding
            map.flyToBounds(bounds, {
                padding: [50, 50], 
                duration: 3.0      // Animation speed in seconds
            });
        }
        document.getElementById('status_text').innerText = "Map fit to all points.";
    } else {
        document.getElementById('status_text').innerText = "No points available to zoom to.";
    }
}

function toggleMeasureTool() {
    window.isMeasuring = !window.isMeasuring;
    //if (measureLine) map.removeLayer(measureLine);
    
    if (window.isMeasuring) {
        map.getContainer().style.cursor = 'crosshair';
        document.getElementById('status_text').innerText = "📐 Ruler tool active: Click first point.";
    } else {
        map.getContainer().style.cursor = '';
        document.getElementById('status_text').innerText = "Ruler Tool Disabled.";
        if (typeof measureLine !== 'undefined' && measureLine) map.removeLayer(measureLine);
        measurePoints = [];
    }
}

function addMapCustomControls() {
    const CustomControl = L.Control.extend({
        options: { position: 'topright' }, // Positions it below the zoom +/- buttons

        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-map-controls');
            container.style.backgroundColor = 'white';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';

            // 1. Zoom Extents Button
            const zoomBtn = L.DomUtil.create('a', 'map-tool-btn', container);
            zoomBtn.innerHTML = '🔍'; // Or use your SVG
            zoomBtn.title = 'Zoom to Extents';
            zoomBtn.onclick = function(e) {
                L.DomEvent.stopPropagation(e);
                zoomToAllPoints();
            };

            // 2. Measure Tool Button
            const measureBtn = L.DomUtil.create('a', 'map-tool-btn', container);
            measureBtn.innerHTML = '📏';
            measureBtn.title = 'Measure Distance & Bearing';
            measureBtn.id = 'mapMeasureBtn';
            measureBtn.onclick = function(e) {
                L.DomEvent.stopPropagation(e);
                toggleMeasureTool();
                // Visual toggle
                this.style.backgroundColor = window.isMeasuring ? 'var(--accent-gold)' : 'white';
                this.style.color = window.isMeasuring ? 'white' : 'black';
            };

            return container;
        }
    });

    map.addControl(new CustomControl());
}

function handleMeasureClick(latlng) {
    if (!window.measurePoints) window.measurePoints = [];

    window.measurePoints.push(latlng);
    
    if (window.measurePoints.length === 1) {
        // First point selected
        document.getElementById('status_text').innerText = "First point set. Click the second point.";
        
        // Add a temporary small dot to show the start
        const startDot = L.circleMarker(latlng, { 
            radius: 4, 
            color: 'var(--accent-gold)',
            fillOpacity: 1 
        }).addTo(map);
        startDot.options.temp = true; // Mark it for easy cleanup
        
    } else if (window.measurePoints.length === 2) {
        // Second point selected
        const p1 = window.measurePoints[0];
        const p2 = window.measurePoints[1];

        // 1. Calculate Distance (Meters)
        const dist = map.distance(p1, p2);

        // 2. Calculate Bearing (using a simple math helper)
        const brg = calculateBearing(p1, p2);

        // 3. Draw the dashed line
        if (window.measureLine) map.removeLayer(window.measureLine);
        window.measureLine = L.polyline([p1, p2], { 
            color: 'var(--accent-gold)', 
            weight: 3, 
            dashArray: '5, 10' 
        }).addTo(map);

        // 4. Update the Status Bar
        const result = `Join: ${dist.toFixed(3)}m @ ${COGO.degToDms(brg)}`;
        document.getElementById('status_text').innerText = result;
        
        // 5. Cleanup temp dots and reset
        map.eachLayer(layer => { if(layer.options && layer.options.temp) map.removeLayer(layer); });
        window.measurePoints = [];
    }
}

function calculateBearing(p1, p2) {
    const rad = Math.PI / 180;
    const lat1 = p1.lat * rad, lat2 = p2.lat * rad;
    const lon1 = p1.lng * rad, lon2 = p2.lng * rad;
    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let brg = Math.atan2(y, x) * (180 / Math.PI);
    return (brg + 360) % 360;
}

function setDatum(srid) {
    document.getElementById('edit_srid').value = srid;
    
    // Toggle UI Highlight
    document.getElementById('btn_wgs').classList.toggle('active_sub', srid === 4326);
    document.getElementById('btn_arc').classList.toggle('active_sub', srid === 20935);
}
