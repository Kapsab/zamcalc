window.helmertPairs = [];
window.tempOld = null;
let areaPoints = [];
let runningAngleSum = 0;

// 1. MATH ENGINE (Replaces BASIC POL/REC/SIN logic)
const COGO = {
	// Converts D.MMSS to Decimal Degrees
    dmsToDeg: function(dms) {
        if (!dms || isNaN(dms)) return 0;
        const sgn = dms < 0 ? -1 : 1;
        const absDms = Math.abs(dms);
        
        const deg = Math.floor(absDms);
        const fraction = (absDms - deg) * 100;
        const min = Math.floor(fraction + 0.0001);
        const sec = (fraction - min) * 100;
        
        return sgn * (deg + min / 60 + sec / 3600);
    },
	deg2rad: (d) => (d * Math.PI) / 180,
	rad2deg: (r) => (r * 180) / Math.PI,
	rectangular: (dist, brg) => ({
		y: dist * Math.sin(COGO.deg2rad(brg)),
		x: dist * Math.cos(COGO.deg2rad(brg))
	}),
	polar: (dy, dx) => {
		let a = COGO.rad2deg(Math.atan2(dy, dx));
		return { dist: Math.sqrt(dy*dy + dx*dx), brg: a < 0 ? a + 360 : a };
	},
	degToDms: function(deg) {
		const sgn = deg < 0 ? "-" : "";
		let d = Math.abs(deg);
		const degrees = Math.floor(d);
		const minutes = Math.floor((d - degrees) * 60);
		const seconds = Math.round(((d - degrees) * 60 - minutes) * 60);
		
		if(seconds >= 60) { seconds = 0; minutes++; }
		if(minutes >= 60) { minutes = 0; degrees++; }
		
		// Pad with leading zeros
		const mm = String(minutes).padStart(2, '0');
		const ss = String(seconds).padStart(2, '0');
		
		return `${sgn}${degrees}.${mm}${ss}`;
	}
};

const ProjCorrection = {
	R_EARTH: 6378137,	// WGS84 radius in meters
	CAPE_FT_TO_M: 0.3047972654,
	FT_TO_M: 0.3048,
    loScale: function(yMeanKm) {
        return 1 + (0.01237 * Math.pow(yMeanKm, 2) * 1e-6);
    },
    utmScale: function(eMeanKm) {
        const ym = eMeanKm - 500;
        return 0.9996 * (1 + (0.01237 * Math.pow(ym, 2) * 1e-6));
    },
    convert: function(value, from, to) {
        let meters;
        // First convert everything to meters
        if (from === 'm') meters = value;
        else if (from === 'ft') meters = value * this.FT_TO_M;
        else if (from === 'cft') meters = value * this.CAPE_FT_TO_M;

        // Then convert meters to the target unit
        if (to === 'm') return meters;
        if (to === 'ft') return meters / this.FT_TO_M;
        if (to === 'cft') return meters / this.CAPE_FT_TO_M;
    }
};

window.traverseData = {
    mode: 'bear', // 'bear' or 'dir'
    stations: [], // [{hAng, dist, vAng}, ...]
    stnA: {y:0, x:0},
    stnB: {y:0, x:0}, // Backsight for orientation
    stnC: {y:0, x:0}, // Closing point
    stnD: {y:0, x:0}  // Closing orientation
};

const TraverseEngine = {
    calculate: function(data) {
        let totalDist = 0;
        let tempPoints = [];
        
        // --- PHASE 1: ANGULAR ADJUSTMENT (Optional) ---
        let corrPerStn = 0;
        let angularMisclosure = 0;

        // Only adjust angles if we have a closing bearing (Closed/Link Traverse)
        if (data.endBrg !== undefined && data.endBrg !== null) {
            let runningBrg = data.startBrg;
            data.stations.forEach(stn => {
                runningBrg = (runningBrg + COGO.dmsToDeg(stn.hAng)) % 360;
                if (runningBrg < 0) runningBrg += 360;
            });
            angularMisclosure = data.endBrg - runningBrg;
            corrPerStn = angularMisclosure / data.stations.length;
        }

        // --- PHASE 2: COORDINATE CALCULATION ---
        let currentY = data.stnA.y;
        let currentX = data.stnA.x;
        let adjustedBrg = data.startBrg;

        data.stations.forEach((stn, index) => {
            // Apply cumulative angular correction (will be 0 for Unclosed)
            adjustedBrg = (adjustedBrg + COGO.dmsToDeg(stn.hAng) + corrPerStn) % 360;
            if (adjustedBrg < 0) adjustedBrg += 360;
            
            const dist = parseFloat(stn.dist);
            const offset = COGO.rectangular(dist, adjustedBrg);
            
            currentY += offset.y;
            currentX += offset.x;
            totalDist += dist;

            tempPoints.push({ y: currentY, x: currentX, dist: dist, brg: adjustedBrg });
        });
		
		let misY = 0, misX = 0, linearErr = 0, accuracy = 0;
		
        // --- PHASE 3: LINEAR MISCLOSURE ---
        const targetY = data.stnC && data.stnC.y !== undefined ? data.stnC.y : data.stnA.y;
        const targetX = data.stnC && data.stnC.x !== undefined ? data.stnC.x :  data.stnA.x;
        
		misY = targetY - currentY;
		misX = targetX - currentX;
		linearErr = Math.sqrt(misY * misY + misX * misX);
        // Avoid division by zero
		accuracy = linearErr > 0 ? totalDist / linearErr : 0;

        return { 
            points: tempPoints, // Change 'points' to 'results' to match your save function
            misY,
            misX, 
            totalDist,
            linearErr, 
            angularMisclosure: angularMisclosure || 0,
            accuracy 
        };
    },
    applyBowditch: function(report) {
        let cumDist = 0;
        // Map through the results and apply proportional corrections
        return report.points.map(pt => {
            cumDist += pt.dist;
            const corrY = (report.misY * (cumDist / report.totalDist));
            const corrX = (report.misX * (cumDist / report.totalDist));
            return {
                y: pt.y + corrY,
                x: pt.x + corrX,
                brg: pt.brg,
                dist: pt.dist
            };
        });
    }
};

function addTrvLeg() {
    const ang = document.getElementById('trv_ang').value;
    const dist = document.getElementById('trv_dist').value;
    if(!ang || !dist) { alert("Please enter both Angle and Distance."); return;;}

    window.traverseData.stations.push({ hAng: ang, dist: parseFloat(dist), vAng: 90 });
    
    const list = document.getElementById('trv_list');
    const li = document.createElement('li');
    li.innerText = `Leg ${window.traverseData.stations.length}: ${ang} / ${dist}m`;
    list.appendChild(li);
    
    document.getElementById('trv_ang').value = "";
    document.getElementById('trv_dist').value = "";
    document.getElementById('trv_ang').focus(); //Put the cursor back in the angle box
}

function runTraverse() {
    const report = TraverseEngine.calculate(window.traverseData);
    const lErr = report.linearErr || 0;
    const acc = report.accuracy || 0;
    const msg = `Accuracy: 1/${Math.round(acc)} | Err: ${report.linearErr.toFixed(3)}m`;
    alert(msg);
    
    if (confirm("Apply Bowditch Adjustment and save points?")) {
        const adjusted = TraverseEngine.applyBowditch(report);
        adjusted.forEach((pt, i) => addResultToTable(`TRV_${i+1}`, pt.y, pt.x));
    }
}

function runAdjustedTraverse(mode) {
    // 1. Coordinates for A (Start), B (Orientation), and C (Closing)
    const sY = parseFloat(document.getElementById('stn_y').value); 
    const sX = parseFloat(document.getElementById('stn_x').value);
    const bY = parseFloat(document.getElementById('bs_y').value); 
    const bX = parseFloat(document.getElementById('bs_x').value); 
    const cY = parseFloat(document.getElementById('cy_y').value); 
    const cX = parseFloat(document.getElementById('cy_x').value);
    
    const eBrg = parseFloat(document.getElementById('end_brg').value);

    // SAFETY CHECK: Ensure all control data is present
    if (isNaN(sY) || isNaN(sX) || isNaN(bY) || isNaN(bX)) {
        alert("Missing Start Control: Please pick Station A and Backsight B.");
        return;
    }

    if (isNaN(cY) || isNaN(cX)) {
        alert("Missing Closing Control: Please pick Closing Station C from the table.");
        return;
    }

    if (isNaN(eBrg)) {
        alert("Missing Closing Bearing: Please enter the fixed orientation at Station C.");
        return;
    }

    if (window.traverseData.stations.length === 0) {
        alert("Traverse is empty! Add some legs using the (+) button first.");
        return;
    }

    // 2. Calculate Start Bearing from A to B (The baseline orientation)
    const startBrg = COGO.polar(bY - sY, bX - sX).brg;
    
    // 3. Get the Fixed Closing Bearing from the input
    const endBrg = COGO.dmsToDeg(parseFloat(document.getElementById('end_brg').value)) || 0;

    const data = {
        startBrg: startBrg,
        endBrg: endBrg,
        stnA: { y: sY, x: sX },
        stnC: { y: cY, x: cX },
        stations: window.traverseData.stations,
        mode: 'dir' // Force direction mode for cld di
    };

    // 4. Engine Run
    const report = TraverseEngine.calculate(data);
    const adjusted = TraverseEngine.applyBowditch(report);
    window.lastAdjustedTraverse = adjusted;

    // 5. Update UI (Summary Header)
    document.getElementById('report_summary').innerHTML = `
        <b>Angular Misclosure:</b> ${COGO.degToDms(report.angularMisclosure)} <br>
        <b>Linear Misclosure:</b> Y: ${report.misY.toFixed(3)}m, X: ${report.misX.toFixed(3)}m | <b>Total:</b> ${report.linearErr.toFixed(3)}m <br>
        <b>Relative Accuracy:</b> 1 / ${Math.round(report.accuracy)} | <b>Total Distance:</b> ${report.totalDist.toFixed(2)}m
    `;

    // 6. Populate Report Table
    const tbody = document.querySelector("#report_table tbody");
    tbody.innerHTML = "";
    
    adjusted.forEach((pt, i) => {
        const row = tbody.insertRow();
        const obs = data.stations[i];
        row.innerHTML = `
            <td>Stn ${i+1}</td>
            <td>${obs.hAng}</td>
            <td>${COGO.degToDms(pt.brg)}</td>
            <td>${parseFloat(pt.dist).toFixed(3)}</td>
            <td>${pt.y.toFixed(3)}</td>
            <td>${pt.x.toFixed(3)}</td>
        `;
    });

    document.getElementById('reportModal').style.display = 'block';
}

const HelmertEngine = {
    // Calculates transformation parameters (a, b, x0, y0, scale)
    calculateParameters: function(pairs) {
        let n = pairs.length;
        if (n < 2) return null;

        let s1=0, s2=0, s3=0, s4=0, s5=0, s6=0, s8=0, s9=0, s7=0, a_sum=0, b_sum=0;
        
        const x1 = pairs[0].oldX;
        const y1 = pairs[0].oldY;

        pairs.forEach(p => {
            s1 += p.oldX;
            s2 += p.oldX - x1;
            s3 += p.oldY;
            s4 += p.oldY - y1;
            s5 += p.newX;
            s6 += p.newX - x1;
            s8 += p.newY;
            s9 += p.newY - y1;
            
            s7 += Math.pow(p.newX - x1, 2) + Math.pow(p.newY - y1, 2);
            a_sum += (p.oldX - x1) * (p.newX - x1) + (p.oldY - y1) * (p.newY - y1);
            b_sum += (p.oldX - x1) * (p.newY - y1) - (p.oldY - y1) * (p.newX - x1);
        });

        const tmp = 1 / n;
        const a = (a_sum - (s6 * s2 * tmp + s9 * s4 * tmp)) / (s7 - (s6 * s6 * tmp + s9 * s9 * tmp));
        const b = (b_sum - (s9 * s2 * tmp) + (s6 * s4 * tmp)) / (s7 - (s6 * s6 * tmp + s9 * s9 * tmp));
        
        const x0 = (s1 - s5 * a - s8 * b) / n;
        const y0 = (s3 - s8 * a + b * s5) / n;
        const scale = Math.sqrt(a * a + b * b);
        const rotation = Math.acos(a / scale) * (180 / Math.PI);

        return { a, b, x0, y0, scale, rotation };
    },

	// Transforms a single point using calculated parameters (Line 24410)
	transformPoint: function(ptax, ptay, params) {
        const x = ptay * params.b + ptax * params.a + params.x0;
        const y = params.y0 + params.a * ptay - params.b * ptax;
        return { x, y };
    },
    
	calculateStandardError: function(pairs, params) {
		let sumSquares = 0;
		let n = pairs.length;

		if (n < 3) return 0; // Standard error requires at least 3 points for redundancy

		pairs.forEach(p => {
		    const calc = this.transformPoint(p.oldX, p.oldY, params);
		    
		    const dx = calc.x - p.newX;
		    const dy = calc.y - p.newY;
		    
		    sumSquares += (dx * dx) + (dy * dy);
		});

		const stdError = Math.sqrt(sumSquares / (2 * (n - 2)));
		return stdError;
	}
};

function computeHelmertParams() {
    if (window.helmertPairs.length < 2) {
        alert("You need at least 2 pairs of points to calculate parameters.");
        return;
    }
    
    const params = HelmertEngine.calculateParameters(window.helmertPairs);
    
    if (!params) {
    	alert("Transformation failed. Check your input points.");
    	return;
    }

    const stdError = HelmertEngine.calculateStandardError(window.helmertPairs, params);

    const report = `
        Scale: ${params.scale.toFixed(6)}
        Rotation: ${params.rotation.toFixed(4)}°
        Translation Y0: ${params.y0.toFixed(3)}
        Translation X0: ${params.x0.toFixed(3)}
        Std Error: ${stdError.toFixed(4)}m
    `;
    
    alert("Transformation Parameters Calculated:\n" + report);
    
    // Save globally for the 'Preview' feature
    window.activeHelmertParams = params;
    
	document.getElementById('status_text').style.color = "var(--accent-gold)";
    document.getElementById('status_text').innerText = "Transformation Active. Click rows to preview.";
}

function calculateSlopeCorrection() {
    const hA = parseFloat(document.getElementById('height_a').value);
    const hB = parseFloat(document.getElementById('height_b').value);
    const sDist = parseFloat(document.getElementById('slope_dist').value);
    const R = 6371000; // Earth's Mean Radius (am in BASIC)

    // BASIC Line 27270
    const seaLevelCorr = -sDist * (hA + hB) / (2 * R);
    const slopeCorr = -Math.pow(hA - hB, 2) / (2 * sDist);
    const refCorr = Math.pow(sDist, 3) / (25.6 * Math.pow(R, 2));

    const finalDist = sDist + seaLevelCorr + slopeCorr + refCorr;
    
    document.getElementById('corr_result').innerText = 
        `Corrected Horizontal Dist: ${finalDist.toFixed(3)}m`;
}

function runUnitConversion() {
    const val = parseFloat(document.getElementById('conv_val').value);
    const from = document.getElementById('unit_from').value;
    const to = document.getElementById('unit_to').value;
    const resultDiv = document.getElementById('conv_result');

    if (isNaN(val)) {
        resultDiv.innerText = "0.000";
        return;
    }

    const result = ProjCorrection.convert(val, from, to);
    resultDiv.innerText = result.toFixed(4);
    document.getElementById('unit_label').innerText = to.toUpperCase();
}

// Manual override for Helmert parameters
function saveManualParams() {
    window.activeHelmertParams = {
        y0: parseFloat(document.getElementById('h_y0').value),
        x0: parseFloat(document.getElementById('h_x0').value),
        a: parseFloat(document.getElementById('h_a').value),
        b: parseFloat(document.getElementById('h_b').value),
        scale: Math.sqrt(Math.pow(parseFloat(document.getElementById('h_a').value), 2) + Math.pow(parseFloat(document.getElementById('h_b').value), 2)),
        rotation: 0 // Rotation is typically viewed, not manually set when entering a/b
    };
    document.getElementById('status_text').innerText = "Manual transformation parameters active.";
}

// Precise reduction of distances (BASIC Line 27270)
function calculateSlopeCorrection() {
    const hA = parseFloat(document.getElementById('h_a').value) || 0;
    const hB = parseFloat(document.getElementById('h_b').value) || 0;
    const s = parseFloat(document.getElementById('s_dist').value) || 0;
    const R = 6371000; // Earth's Radius (am)

    if (s === 0) return;

    // The BASIC formula: corr = -s*(hpa+hpb)/(2*am) - ((hpa-hpb)^2)/(2*s) + (s^3)/(25.6*am^2)
    const seaLevel = -s * (hA + hB) / (2 * R);
    const slope = -Math.pow(hA - hB, 2) / (2 * s);
    const ref = Math.pow(s, 3) / (25.6 * Math.pow(R, 2));
    
    const corr = seaLevel + slope + ref;
    const finalDist = s + corr;

    document.getElementById('slp_res').innerText = finalDist.toFixed(3);
    document.getElementById('slp_corr').innerText = `TOTAL CORR: ${corr.toFixed(4)}m`;
}

// 2. RADIATION COMPUTATION (Lines 10100-10130 translation)
function computeRadiation(mode) {
	const sY = parseFloat(document.getElementById('stn_y').value);
	const sX = parseFloat(document.getElementById('stn_x').value);
	const dst = parseFloat(document.getElementById('dist').value);
	const rawAng = parseFloat(document.getElementById('h_ang').value);
	const hAng = COGO.dmsToDeg(rawAng);

	let finalY, finalX;

	if (mode === 'r be') {
		const off = COGO.rectangular(dst, hAng);
		finalY = sY + off.y; finalX = sX + off.x;
	} else if (mode === 'r di') {
		const bY = parseFloat(document.getElementById('bs_y').value);
		const bX = parseFloat(document.getElementById('bs_x').value);
		const ori = COGO.polar(bY - sY, bX - sX); // POL logic
		const off = COGO.rectangular(dst, ori.brg + hAng); // REC logic
		finalY = sY + off.y; finalX = sX + off.x;
	} else if (mode === 'r ecc') {
		const eccD = parseFloat(document.getElementById('ecc_dist').value);
		const eccA = parseFloat(document.getElementById('ecc_ang').value);
		const bsY = parseFloat(document.getElementById('bs_y').value);
		const bsX = parseFloat(document.getElementById('bs_x').value);
		
		const result = calculateEccentric(sY, sX, bsY, bsX, dst, hAng, eccD, eccA);
		finalY = result.y; 
		finalX = result.x;
		
	}
	
	const ptId = prompt("Enter ID for this new point:", "1001");
	
	if(ptId) {
		const newPt = {
			pt_no: ptId,
			easting: parseFloat(finalY.toFixed(3)),
			northing: parseFloat(finalX.toFixed(3)),
			elevation: 0.000
		};
		document.getElementById('status_text').innerText = `Calculating...`;
		savePointToDB(newPt);
	}
}

function calculateArea(points) {
    if (points.length < 3) return 0;
    
    let area = 0;
    let j = points.length - 1;

    for (let i = 0; i < points.length; i++) {
        // BASIC logic: area = area + .5 * xn * (pty - ynn)
        // Using Surveyor's formula: (X1*Y2 - Y1*X2)
        area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
        j = i;
    }

    return Math.abs(area / 2.0);
}

// Add this to your computeRadiation function or SurveyMath engine
function calculateEccentric(stnY, stnX, bsY, bsX, obsDist, obsHorAng, eccDist, eccHorAng) {
	// 1. Join Station to Backsight (Initial Orientation)
	const joinBS = COGO.polar(bsY - stnY, bsX - stnX);
	
	// 2. Compute true instrument position (Eccentric Station coords)
	// BASIC Line 10250: nul = REC(dst, Y + horang): y = Y + ptay: x = X + ptax
	const eccOffset = COGO.rectangular(eccDist, joinBS.brg + eccHorAng);
	const instY = stnY + eccOffset.y;
	const instX = stnX + eccOffset.x;

	// 3. Correction for target observation
	// BASIC Line 10240: horang = horang + ASN(dst * SIN(horang) / X)
	// Here, X is typically the distance to the target
	const targetJoin = COGO.polar(bsY - instY, bsX - instX);
	const corrAngle = Math.asin((eccDist * Math.sin(COGO.deg2rad(obsHorAng))) / targetJoin.dist);
	const finalBearing = targetJoin.brg + obsHorAng + COGO.rad2deg(corrAngle);

	// 4. Final Target Coordinates
	const targetOffset = COGO.rectangular(obsDist, finalBearing);
	return {
		y: instY + targetOffset.y,
		x: instX + targetOffset.x
	};
}

function addAngleToSum() {
    const input = document.getElementById('quick_ang');
    const val = parseFloat(input.value);

    if (isNaN(val)) return;

    // BASIC Line 19040: GOSUB dms2deg
    const degVal = COGO.dmsToDeg(val);
    
    // BASIC Line 19060: sum = sum + v
    runningAngleSum += degVal;

    // Normalize to 360 if it's for bearings, or leave as is for total interior angles
    // For general summing, we usually just let it grow.
    
    document.getElementById('sum_display').innerText = COGO.degToDms(runningAngleSum);
    input.value = "";
    input.focus();
}

function clearAngleSum() {
    runningAngleSum = 0;
    document.getElementById('sum_display').innerText = "0°00'00\"";
}

function runDmsToDec() {
    const dms = parseFloat(document.getElementById('input_dms').value);
    if (isNaN(dms)) return;
    
    const dec = COGO.dmsToDeg(dms);
    document.getElementById('conv_res_val').innerText = dec.toFixed(6);
    document.getElementById('conv_res_label').innerText = "DECIMAL DEGREES";
}

function runDecToDms() {
    const dec = parseFloat(document.getElementById('input_dec').value);
    if (isNaN(dec)) return;
    
    // Using our helper to get a nice formatted string
    const dmsString = COGO.degToDms(dec);
    document.getElementById('conv_res_val').innerText = dmsString;
    document.getElementById('conv_res_label').innerText = "D° M' S\"";
}

function removeLastAreaPoint() {
    if (!window.areaPoints || window.areaPoints.length === 0) return;

    // 1. Remove the last point from the array
    window.areaPoints.pop();

    // 2. Update the UI List
    const areaList = document.getElementById('area_pt_list');
    if (window.areaPoints.length === 0) {
        areaList.innerHTML = '<li style="border:none; color:#ccc;">No points selected</li>';
        document.getElementById('area_result').value = "";
    } else {
        // Rebuild the list from the remaining points
        areaList.innerHTML = "";
        window.areaPoints.forEach(p => {
            const li = document.createElement('li');
            li.style.border = "none";
            li.innerText = `Pt: ${p.id} (Y:${p.y})`;
            areaList.appendChild(li);
        });

        // 3. Re-calculate Area (if we still have 3+ points)
        if (window.areaPoints.length >= 3) {
            const result = calculateArea(window.areaPoints);
            document.getElementById('area_result').value = result.toFixed(3);
        } else {
            document.getElementById('area_result').value = "";
        }
    }
    
    document.getElementById('status_text').innerText = "Last point removed.";
}

function computeResection(mode) {
    const ay = parseFloat(document.getElementById('ay').value), ax = parseFloat(document.getElementById('ax').value);
    const by = parseFloat(document.getElementById('by').value), bx = parseFloat(document.getElementById('bx').value);
    
    let resY, resX;

    if (mode === 'res dir') {
        const cy = parseFloat(document.getElementById('cy').value), cx = parseFloat(document.getElementById('cx').value);
        const aDir = parseFloat(document.getElementById('adir').value);
        const bDir = parseFloat(document.getElementById('bdir').value);
        const cDir = parseFloat(document.getElementById('cdir').value);

        const cotB = 1 / Math.tan(COGO.deg2rad(bDir - aDir));
        const cotC = 1 / Math.tan(COGO.deg2rad(cDir - aDir));

        const xb = (bx - ax) - (by - ay) * cotB;
        const yb = (by - ay) + (bx - ax) * cotB;
        const xc = (cx - ax) - (cy - ay) * cotC;
        const yc = (cy - ay) + (cx - ax) * cotC;

        const tn = -(xc - xb) / (yc - yb);
        const dx = (xb + yb * tn) / (1 + tn * tn);
        
        resX = ax + dx;
        resY = ay + dx * tn;
    } 
    else if (mode === 'res dist') {
        const dsta = parseFloat(document.getElementById('adist').value);
        const dstb = parseFloat(document.getElementById('bdist').value);

        const join = COGO.polar(by - ay, bx - ax);
        const X = join.dist; // Distance between known points
        
        const xx = (X * X + dsta * dsta - dstb * dstb) / (2 * X);
        const yy = Math.sqrt(Math.abs(dsta * dsta - xx * xx));
        
        const rel = COGO.polar(yy, xx);
        const final = COGO.rectangular(rel.dist, join.brg + rel.brg);
        
        resY = ay + final.y;
        resX = ax + final.x;
    }

    // Output and Save
    const ptId = prompt("Computed Station Coords. Enter New Point ID:", "RES_STN");
    if (ptId) {
        addResultToTable(ptId, resY, resX);
        document.getElementById('status_text').innerText = `Resection Saved: ${ptId}`;
    }
}

function computeIntersection(mode) {
    const ay = parseFloat(document.getElementById('ay').value), ax = parseFloat(document.getElementById('ax').value);
    const by = parseFloat(document.getElementById('by').value), bx = parseFloat(document.getElementById('bx').value);
    
    let brgA, brgB;

    if (mode === 'inter be') {
        brgA = parseFloat(document.getElementById('abrg').value);
        brgB = parseFloat(document.getElementById('bbrg').value);
    } 
    else if (mode === 'inter di') {
        const bsy = parseFloat(document.getElementById('cy').value), bsx = parseFloat(document.getElementById('cx').value);
        const aDir = parseFloat(document.getElementById('adir').value);
        const bDir = parseFloat(document.getElementById('bdir').value);

        const ori = COGO.polar(bsy - ay, bsx - ax);
        brgA = ori.brg + aDir;
        brgB = ori.brg + bDir; // Assuming same backsight was used for orientation at both stations
    }

    const tA = Math.tan(COGO.deg2rad(brgA));
    const tB = Math.tan(COGO.deg2rad(brgB));

    if (Math.abs(tA - tB) < 1e-10) {
        alert("Lines are parallel; no intersection possible.");
        return;
    }

    // Solve for X: (ax + dx) and (bx + dx2) intersect where Y is equal
    const resX = (by - ay + ax * tA - bx * tB) / (tA - tB);
    const resY = ay + (resX - ax) * tA;

    const ptId = prompt("Intersection Point Found. Enter ID:", "INT_PT");
    if (ptId) {
        addResultToTable(ptId, resY, resX);
        document.getElementById('status_text').innerText = `Intersection Saved: ${ptId}`;
    }
}

function updateAreaDisplay() {
    const status = document.getElementById('status_text');
    const resultInput = document.getElementById('area_result');
    const areaList = document.getElementById('area_pt_list');
    
    if (areaList) {
        if (areaPoints.length === 0) {
            areaList.innerHTML = '<li style="border:none; color:#ccc;">No points selected</li>';
        } else {
            areaList.innerHTML = areaPoints.map(p => 
                `<li style="font-size:12px; border-bottom:1px solid #eee; padding:3px;">Pt: ${p.pt_no || 'Unnamed'}</li>`
            ).join('');
        }
    }
    
    if (areaPoints.length < 3) {
        status.innerText = `Selected ${areaPoints.length} points for area (Need 3+)`;
        return;
    }

    const area = calculateArea(areaPoints);
    const ha = (area / 10000).toFixed(4);
    const areaText = `${area.toFixed(3)} sq. m (${ha} Ha)`;
    status.innerText = `Calculated Area: ${areaText}`;
    
    if (resultInput) { resultInput.value = area.toFixed(3); }
}

function runAreaCalculation() {
    if (areaPoints.length < 3) {
        alert("Please select at least 3 points from the table first.");
        return;
    }
    const area = calculateArea(areaPoints);
    //alert(`Total Area: ${area.toFixed(3)} m²\nHectares: ${(area / 10000).toFixed(4)} Ha`);
}

function resetArea() {
    areaPoints = [];
    document.querySelectorAll('.selected_for_area').forEach(row => {
        row.classList.remove('selected_for_area');
    });
    updateAreaDisplay();
}

async function saveReportToDB() {
    const status = document.getElementById('status_text');
    if (!window.lastAdjustedTraverse) return;

    for (let i = 0; i < window.lastAdjustedTraverse.length; i++) {
        const pt = window.lastAdjustedTraverse[i];
        // 1. DATA VALIDATION CHECK
        const east = pt.y || pt.currentY;
        const north = pt.x || pt.currentX;

        if (east === undefined || north === undefined || east === null || (east === 0 && north === 0)) {
            console.error("Validation Failed for point:", pt);
            alert(`Error: Point ${i + 1} has invalid coordinates. Save cancelled.`);
            status.innerText = "Save aborted: Invalid data detected.";
            return; // Stop the entire save process
        }

        const ptData = {
            pt_no: `TRV_${i + 1}_${Date.now().toString().slice(-4)}`, // Unique ID
            easting: pt.y || pt.currentY || 0,
            northing: pt.x || pt.currentX || 0,
            elevation: 0.00
        };

        try {
            const response = await fetch('/api/points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ptData)
            });

            if (!response.ok) {
                const txt = await response.text();
                console.error("Server rejected save:", txt);
                alert("Save failed at Point " + (i + 1) + ": " + txt);
                status.innerText = "Error: " + txt;
                return; // Stop the loop if one fails
            }

            const savedPt = await response.json();
            console.log("Saved successfully:", savedPt);
            
            // Handle if result is rows array or single object
            const p = Array.isArray(savedPt) ? savedPt[0] : savedPt;
            addResultToTable(p.id, p.pt_no, p.easting, p.northing, p.elevation);

        } catch (err) {
            console.error("Network/Fetch error:", err);
            status.innerText = "Connection lost.";
            return;
        }
    }
    status.innerText = "All points saved to database.";
    document.getElementById('reportModal').style.display = 'none';
}

function runUnclosedTraverse(mode) {
    const stnY = parseFloat(document.getElementById('stn_y').value);
    const stnX = parseFloat(document.getElementById('stn_x').value);
    
    let startBrg = 0;
    if (mode === 'dir') {
        const bsY = parseFloat(document.getElementById('bs_y').value);
        const bsX = parseFloat(document.getElementById('bs_x').value);
        startBrg = COGO.polar(bsY - stnY, bsX - stnX).brg;
    }

    const data = {
        startBrg: startBrg,
        stnA: { y: stnY, x: stnX },
        stations: window.traverseData.stations,
        mode: mode
    };

    // We reuse the calculation part of the engine
    const report = TraverseEngine.calculate(data);
    
    window.lastAdjustedTraverse = report.points;
    
    if (confirm(`Calculated ${report.points.length} stations. Save to database?`)) {
        saveReportToDB();
    }
}

function undoLastLeg() {
    if (window.traverseData.stations.length === 0) {
        alert("No legs to undo!");
        return;
    }

    // 1. Remove the last item from the data array
    window.traverseData.stations.pop();

    // 2. Remove the last visual item from the <ul> list
    const list = document.getElementById('trv_list');
    if (list && list.lastElementChild) {
        list.removeChild(list.lastElementChild);
    }

    document.getElementById('status_text').innerText = "Last leg removed.";
}

function clearTraverseList() {
    if (confirm("Are you sure you want to clear all added legs?")) {
        // 1. Clear the data array
        window.traverseData.stations = [];
        
        // 2. Clear the visual list
        const list = document.getElementById('trv_list');
        if (list) list.innerHTML = "";
        
        // 3. Optional: Clear the coordinate fields too?
        document.getElementById('stn_y').value = "";
        document.getElementById('stn_x').value = "";
        document.getElementById('bs_y').value = "";
        document.getElementById('bs_x').value = "";
        if (document.getElementById('cy_y')) {
            document.getElementById('cy_y').value = "";
            document.getElementById('cy_x').value = "";
        }

        document.getElementById('status_text').innerText = "Traverse data cleared.";
    }
}