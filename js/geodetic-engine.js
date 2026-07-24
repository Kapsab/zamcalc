const GeodeticEngine = {
    // Spheroid Coefficients (Line 30020)
    ellipsoids: {
        clarke1880: {
            a: 6378249.14533,	// Legal Clarke 1880 Modified
            b: 6356514.96672,	// Corresponding semi-minor axis
            esq: 0.006803511283, // Precise eccentricity squared
            // Meridian distance coefficients for Clarke 1880
            A: 6367386.6437, B: 16300.696, C: 17.387, D: 0.023	// Exact NGI meridian arc constants
        },
        wgs84: {
            a: 6378137.0,
            b: 6356752.314,
            esq: 0.006694380,
            // Meridian distance coefficients for WGS84
            A: 6367449.146, B: 16038.509, C: 16.833, D: 0.022
        }
    },

    // Grid to Geographicals (Lines 30800-30890)
    gridToGeog: function(y, x, y0, x0, k0, lambda0, ellipName = 'clarke1880') {
        const ellip = this.ellipsoids[ellipName];
        let mf = (x - x0) / k0;
        let fi = mf / ellip.A;
        let dfi, mp;

        // Iteration loop (Line 30830)
        do {
            mp = (ellip.A * fi - ellip.B * Math.sin(2 * fi) + ellip.C * Math.sin(4 * fi) - ellip.D * Math.sin(6 * fi));
            dfi = (mf - mp) / (ellip.A - 2 * ellip.B * Math.cos(2 * fi));
            fi += dfi;
        } while (Math.abs(dfi) > 1e-12);

        let nu = ellip.a / Math.sqrt(1 - ellip.esq * Math.pow(Math.sin(fi), 2));
        let h = (y - y0) / (k0 * nu);
        let eta2 = (ellip.esq * Math.pow(Math.cos(fi), 2)) / (1 - ellip.esq);
        let t2 = Math.pow(Math.tan(fi), 2);

        let lambda = lambda0 + (1 / Math.cos(fi)) * (h - (Math.pow(h, 3) / 6) * (1 + 2 * t2 + eta2));
        let finalFi = fi - (1 + eta2) * Math.tan(fi) * ((Math.pow(h, 2) / 2) - (Math.pow(h, 4) / 24) * (5 + 3 * t2));

        return { lat: finalFi * (180 / Math.PI), lon: lambda * (180 / Math.PI) };
    },

    // Geographicals to Grid (Lines 30900-30950)
    geogToGrid: function(lat, lon, y0, x0, k0, lambda0Deg, ellipName = 'wgs84') {
        const ellip = this.ellipsoids[ellipName];
        let fi = lat * (Math.PI / 180);
        let lambda = lon * (Math.PI / 180);
        let lambda0 = lambda0Deg * (Math.PI / 180);

        let j = (lambda - lambda0) * Math.cos(fi);
        let eta2 = (ellip.esq * Math.pow(Math.cos(fi), 2)) / (1 - ellip.esq);
        let t2 = Math.pow(Math.tan(fi), 2);
        let mp = (ellip.A * fi - ellip.B * Math.sin(2 * fi) + ellip.C * Math.sin(4 * fi) - ellip.D * Math.sin(6 * fi));
        let nu = ellip.a / Math.sqrt(1 - ellip.esq * Math.pow(Math.sin(fi), 2));

        let y = y0 + (k0 * nu) * (j + (Math.pow(j, 3) / 6) * (1 - t2 + eta2));
        let x = x0 + k0 * mp + (k0 * nu * Math.tan(fi)) * (Math.pow(j, 2) / 2);

        return { y, x };
    },
    
    // 3-Parameter Molodensky Datum Shift Engine (South African / Zambian Region)
    transformDatum: function(g, fromDatum, toDatum) {
        // Translation parameters between Cape Datum and WGS84
        let dx = -136.0, dy = -108.0, dz = -292.0;
        
        // Invert signs if transforming backwards from WGS84 to Cape
        if (fromDatum === 'WGS84' && toDatum === 'Cape') {
            dx = 136.0; dy = 108.0; dz = 292.0;
        }

        // Standard Molodensky Geodetic Transform approximation formula
        const latRad = g.lat * (Math.PI / 180);
        const lonRad = g.lon * (Math.PI / 180);
        
        const a = 6378137.0; // Mean Reference Radius
        const esq = 0.00669438;
        
        const rn = a / Math.sqrt(1 - esq * Math.pow(Math.sin(latRad), 2));
        const rm = a * (1 - esq) / Math.pow(1 - esq * Math.pow(Math.sin(latRad), 2), 1.5);
        
        const dLat = (-dx * Math.sin(latRad) * Math.cos(lonRad) - dy * Math.sin(latRad) * Math.sin(lonRad) + dz * Math.cos(latRad)) / rm;
        const dLon = (-dx * Math.sin(lonRad) + dy * Math.cos(lonRad)) / (rn * Math.cos(latRad));
        
        return {
            lat: g.lat + dLat * (180 / Math.PI),
            lon: g.lon + dLon * (180 / Math.PI)
        };
    }
};

function runCoordinateTransform(type) {
    const cmOrg = parseFloat(document.getElementById('cm_origin')?.value);
    const cmTar = parseFloat(document.getElementById('cm_target')?.value);
    const GE = GeodeticEngine;
    let res;

    if (type === 'Lo-UTM' || type === 'UTM-Lo') {
        const y = parseFloat(document.getElementById('stn_y').value);
        const x = parseFloat(document.getElementById('stn_x').value);
        if (isNaN(y) || isNaN(x)) return alert("Pick a point first!");

        if (type === 'Lo-UTM') {
			// 1. Lo29 uses Cape Datum (clarke1880)
			let g = GE.gridToGeog(-y, -x, 0, 0, 1, cmOrg * (Math.PI/180), 'clarke1880');
						
			// 2. Project output onto WGS84 UTM system
			res = GE.geogToGrid(g.lat, g.lon, 500000, 10000000, 0.9996, cmTar, 'clarke1880');
		} else {
			// 1. Ensure the Southern Hemisphere False Northing handles absolute mapping spaces cleanly
			let g = GE.gridToGeog(y, x, 500000, 10000000, 0.9996, cmOrg * (Math.PI/180), 'clarke1880');
			
			// 2. FORCE LATITUDE COMPONENT POSITIVE BEFORE PASSING TO SOUTH-POSITIVE LO ENGINE
			const absLat = Math.abs(g.lat);
			
			// 3. Output to Clarke 1880 Lo system parameters using absolute geographic space
			const lo = GE.geogToGrid(absLat, g.lon, 0, 0, 1, cmTar, 'clarke1880');
			
			// 4. Align output coordinates with your target input values
			res = { y: lo.y, x: lo.x };
		}
    } else if (type === 'geo-Lo' || type === 'geo-UTM') {
        const lat = parseFloat(document.getElementById('geo_lat').value);
        const lon = parseFloat(document.getElementById('geo_lon').value);
        if (isNaN(lat) || isNaN(lon)) return alert("Please enter Lat/Lon coordinates.");

        if (type === 'geo-Lo') {
            const lo = GE.geogToGrid(lat, lon, 0, 0, 1, cmTar, 'clarke1880');
            res = { y: -lo.y, x: -lo.x };
        } else {
            res = GE.geogToGrid(lat, lon, 500000, 10000000, 0.9996, cmTar, 'clarke1880');
        }
    }
    alert(`Result:\nY: ${res.y.toFixed(3)}\nX: ${res.x.toFixed(3)}`);
}