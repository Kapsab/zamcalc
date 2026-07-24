let map;

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
        const response = await fetch('/api/map-points');
        const geojsonData = await response.json();

        window.mapLayer = L.geoJSON(geojsonData, {
            pointToLayer: function (feature, latlng) {
                // Create a clean circle marker instead of the default blue pin
                return L.circleMarker(latlng, {
                    radius: 3,
                    fillColor: "#c2a172", // Your brand gold
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.pt_no) {
                    // Use bindTooltip for hover labels
                    layer.bindTooltip(`ID: ${feature.properties.pt_no}`, {
                        permanent: false,   // Only show on hover
                        direction: 'top',   // Position above marker
                        className: 'map-tooltip', // Custom CSS class
                        offset: [0, -10]    // Fine-tune position
                    });
                }
		        layer.on('click', function (e) {
		        	// If the ruler tool is active
		        	if (window.isMeasuring) {
		        		// Stop the click from "bubbling up" to the map
		        		L.DomEvent.stopPropagation(e);
		        		// Send the marker'sexact location to the measure function
		        		handleMeasureClick(e.latlng);
		        	}
		        });
            }	
        }).addTo(map);
        if (window.mapLayer.getLayers().length > 0) {
        	zoomToAllPoints();
        }

    } catch (err) {
        console.error("Map render error:", err);
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