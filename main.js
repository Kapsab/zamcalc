// Global variables
let currentInputTarget = 'stn'; //Default target
let currentPage = 1;
let totalPagesCount = 1;
let allPointsData = [];
let areaPoints = [];
let pointToDelete = null;
let measurePoints = [];
let measureLine = null;
let runningAngleSum = 0;
let map;
let mapLayer;
let currentSearchTerm = '';
const pointsPerPage = 10;

window.helmertPairs = [];
window.tempOld = null;

const tabOptions = {
	tab_radiation: ["r be", "r di", "r ecc", "seto be", "seto di", "area"],
	tab_resection: ["res dir", "res dist", "inter di", "inter be"],
	tab_traverse: ["+/- ang", "u be", "u di", "cld be", "cld di", "ed", "c", "d"],
	tab_transformation: ["helm pts", "helm param", "Losca", "UTMsca", "slopesea"],
	tab_conversion: ["Lo-UTM", "UTM-Lo", "geo-Lo", "geo-UTM", "DMS-Dec", "Units"]
};

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

function openTab(evt, tabName) {
	let links = document.getElementsByClassName("tab_link");
	for (let link of links) link.classList.remove("active");
	evt.currentTarget.classList.add("active");

	let contents = document.getElementsByClassName("tab_content");
	for (let content of contents) content.style.display = "none";
	
	const menuContainer = document.getElementById("dynamic_sub_menu");
    menuContainer.innerHTML = "";

	if (tabName === 'tab_home') {
		document.getElementById("tab_home").style.display = "block";
		if (map) {
			setTimeout(() => { map.invalidateSize(); }, 200);
		}
	} else if (tabName === 'tab_download') {
		document.getElementById("tab_download").style.display = "block";
	} else {
		document.getElementById("tab_dynamic").style.display = "block";
		const menuContainer = document.getElementById("dynamic_sub_menu");
		const options = tabOptions[tabName] || [];
		
		menuContainer.innerHTML = `<ul>${options.map((opt, i) => 
			`<li class="${i === 0 ? 'active_sub' : ''}" onclick="loadForm('${tabName}','${opt}', event)">${opt}</li>`
		).join('')}</ul>`;
		if (options.length > 0) {
			loadForm(tabName, options[0]);
		}
	}
	document.getElementById("status_text").innerText = "Viewing " + tabName.replace('tab_', '');
}

function loadForm(tabName, optionName, evt) {
	if (evt) {
		let items = evt.currentTarget.parentNode.getElementsByTagName("li");
		for (let item of items) item.classList.remove("active_sub");
		evt.currentTarget.classList.add("active_sub");
	}
	
	const calcDiv = document.getElementById("calculator"); // FIX: Defined calcDiv
	calcDiv.classList.remove('fade-in-up'); // Momentarily hide or reset the animation
	void calcDiv.offsetWidth; // Trigger a reflow to restart animation
	let htmlContent = "";
	
	// UI Switching Logic
	if (optionName === 'r be') {
		calcDiv.innerHTML = `
			<h3>Radiation (Bearing)</h3>
			<div class="form_group"><label>Stn Easting (Y)</label><input id="stn_y" type="number" step="0.001"></div>
			<div class="form_group"><label>Stn Northing (X)</label><input id="stn_x" type="number" step="0.001"></div>
			<div class="form_group"><label>Bearing</label><div class="input_wrap"><input id="h_ang" type="number" step="0.0001"></div></div>
			<div class="form_group"><label>Distance</label><input id="dist" type="number" step="0.001"></div>
			<button class="calc_btn" onclick="computeRadiation('r be')">Compute</button>`;
	} else if (optionName === 'r di') {
		calcDiv.innerHTML = `
			<h3>Radiation (Direction)</h3>
			<div class="selection_toggle">
				<button type="button" id="btn_target_stn" class="tableBtn active_sub" onclick="setTarget('stn')" data-tooltip="Instrument stn">Pick Stn</button>
				<button type="button" id="btn_target_bs" class="tableBtn" onclick="setTarget('bs')" data-tooltip="Backsight stn">Pick BS</button>
			</div>
			<div class="form_group"><label>Stn Y/X</label>
				<input id="stn_y" type="number" placeholder="Y"><input id="stn_x" type="number" placeholder="X">
			</div>
			<div class="form_group"><label>Backsight Y/X</label>
				<input id="bs_y" type="number" placeholder="Y"><input id="bs_x" type="number" placeholder="X">
			</div>
			<div class="form_group"><label>Observed Direction</label><div class="input_wrap"><input id="h_ang" type="number"></div></div>
			<div class="form_group"><label>Distance</label><input id="dist" type="number"></div>
			<button class="calc_btn" onclick="computeRadiation('r di')">Compute</button>`;
	} else if (optionName === 'r ecc') {
		calcDiv.innerHTML = `
			<h3>Radiation (Eccentric)</h3>
			<div class="form_group"><label>Stn Y/X</label>
				<div style="display:flex;gap:5px;"><input id="stn_y" type="number" placeholder="Y"><input id="stn_x" type="number" placeholder="X"></div>
			</div>
			<div class="form_group"><label>Backsight Y/X</label>
				<div style="display:flex;gap:5px;"><input id="bs_y" type="number" placeholder="Y"><input id="bs_x" type="number" placeholder="X"></div>
			</div>
			<div class="form_group" style="background:#f0f0e8; padding:10px; border-radius:4px;">
				<label style="color:var(--accent-gold);">Eccentric Offset (E to A)</label>
				<input id="ecc_dist" type="number" placeholder="Dist to Stn A">
				<div class="input_wrap"><input id="ecc_ang" type="number" placeholder="Angle to Stn A"></div>
			</div>
			<div class="form_group"><label>Target Observation</label>
				<div class="input_wrap"><input id="h_ang" type="number" placeholder="Observed Angle"></div>
				<input id="dist" type="number" placeholder="Observed Dist">
			</div>
			<button class="calc_btn" onclick="computeRadiation('r ecc')">Compute</button>
		`;
	} else if (optionName === 'area') {
		calcDiv.innerHTML = `
			<h3>Area Calculation</h3>
			<p style="font-size:12px; color:var(--text-muted);">Click rows in the table to add boundary points.</p>
			<ul id="area_pt_list" style="flex-direction:column; background:#fff; border:1px solid var(--border-color); padding:10px; max-height:150px; overflow-y:auto;">
			    <li style="border:none; color:#ccc;">No points selected</li>
			</ul>
			<div style="display:flex; gap:5px; margin-bottom:15px;">
			    <button class="tableBtn" style="flex:1;" onclick="removeLastAreaPoint()" data-tooltip="Remove last">Remove Last</button>
			    <button class="tableBtn" style="flex:1;" onclick="resetArea()" data-tooltip="Clear all points">Clear All</button>
			</div>
			<div class="form_group" style="margin-top:10px;">
			    <label>Total Area (sq. units)</label>
			    <input id="area_result" type="text" readonly style="background:#eee; font-weight:bold;">
			</div>
		`;
		// Initialize an empty array for this session
		window.areaPoints = [];
	} else if (optionName === 'res dir') {
		calcDiv.innerHTML = `
			<h3>3-Point Resection (Directions)</h3>
			<div class="selection_toggle">
			    <button type="button" id="btn_ptA" class="tableBtn active_sub" onclick="setTarget('ptA')">Pick A</button>
			    <button type="button" id="btn_ptB" class="tableBtn" onclick="setTarget('ptB')">Pick B</button>
			    <button type="button" id="btn_ptC" class="tableBtn" onclick="setTarget('ptC')">Pick C</button>
			</div>
			<div class="form_group"><label>Point A (Y/X/Dir)</label>
			    <div style="display:flex;gap:5px;"><input id="ay" type="number" placeholder="Y"><input id="ax" type="number" placeholder="X"><div class="input_wrap"><input id="adir" type="number" placeholder="Dir"></div></div>
			</div>
			<div class="form_group"><label>Point B (Y/X/Dir)</label>
			    <div style="display:flex;gap:5px;"><input id="by" type="number" placeholder="Y"><input id="bx" type="number" placeholder="X"><div class="input_wrap"><input id="bdir" type="number" placeholder="Dir"></div></div>
			</div>
			<div class="form_group"><label>Point C (Y/X/Dir)</label>
			    <div style="display:flex;gap:5px;"><input id="cy" type="number" placeholder="Y"><input id="cx" type="number" placeholder="X"><div class="input_wrap"><input id="cdir" type="number" placeholder="Dir"></div></div>
			</div>
			<button class="calc_btn" onclick="computeResection('res dir')">Compute Station</button>
		`;
	} else if (optionName === 'res dist') {
		calcDiv.innerHTML = `
			<h3>2-Point Resection (Distances)</h3>
			<div class="selection_toggle">
			    <button type="button" id="btn_ptA" class="tableBtn active_sub" onclick="setTarget('ptA')">Pick A</button>
			    <button type="button" id="btn_ptB" class="tableBtn" onclick="setTarget('ptB')">Pick B</button>
			</div>
			<div class="form_group"><label>Point A (Y/X/Dist)</label>
			    <div style="display:flex;gap:5px;"><input id="ay" type="number" placeholder="Y"><input id="ax" type="number" placeholder="X"><input id="adist" type="number" placeholder="Dist"></div>
			</div>
			<div class="form_group"><label>Point B (Y/X/Dist)</label>
			    <div style="display:flex;gap:5px;"><input id="by" type="number" placeholder="Y"><input id="bx" type="number" placeholder="X"><input id="bdist" type="number" placeholder="Dist"></div>
			</div>
			<button class="calc_btn" onclick="computeResection('res dist')">Compute Station</button>
		`;
	} else if (optionName === 'inter be') {
		calcDiv.innerHTML = `
			<h3>Intersection (Bearings)</h3>
			<div class="selection_toggle">
			    <button type="button" id="btn_ptA" class="tableBtn active_sub" onclick="setTarget('ptA')">Pick A</button>
			    <button type="button" id="btn_ptB" class="tableBtn" onclick="setTarget('ptB')">Pick B</button>
			</div>
			<div class="form_group"><label>Point A (Y/X/Bearing)</label>
			    <div style="display:flex;gap:5px;"><input id="ay" type="number" placeholder="Y"><input id="ax" type="number" placeholder="X"><div class="input_wrap"><input id="abrg" type="number" placeholder="Brg"></div></div>
			</div>
			<div class="form_group"><label>Point B (Y/X/Bearing)</label>
			    <div style="display:flex;gap:5px;"><input id="by" type="number" placeholder="Y"><input id="bx" type="number" placeholder="X"><div class="input_wrap"><input id="bbrg" type="number" placeholder="Brg"></div></div>
			</div>
			<button class="calc_btn" onclick="computeIntersection('inter be')">Compute Intersection</button>
		`;
	} else if (optionName === 'inter di') {
		calcDiv.innerHTML = `
			<h3>Intersection (Directions)</h3>
			<div class="selection_toggle">
			    <button type="button" id="btn_ptA" class="tableBtn active_sub" onclick="setTarget('ptA')">Pick A</button>
			    <button type="button" id="btn_ptB" class="tableBtn" onclick="setTarget('ptB')">Pick B</button>
			    <button type="button" id="btn_ptC" class="tableBtn" onclick="setTarget('ptC')">Backsight</button>
			</div>
			<div class="form_group"><label>Point A (Y/X/Dir)</label>
			    <div style="display:flex;gap:5px;"><input id="ay" type="number" placeholder="Y"><input id="ax" type="number" placeholder="X"><div class="input_wrap"><input id="adir" type="number" placeholder="Dir"></div></div>
			</div>
			<div class="form_group"><label>Point B (Y/X/Dir)</label>
			    <div style="display:flex;gap:5px;"><input id="by" type="number" placeholder="Y"><input id="bx" type="number" placeholder="X"><div class="input_wrap"><input id="bdir" type="number" placeholder="Dir"></div></div>
			</div>
			<div class="form_group"><label>Backsight (Y/X) [for orientation]</label>
			    <div style="display:flex;gap:5px;"><input id="cy" type="number" placeholder="Y"><input id="cx" type="number" placeholder="X"></div>
			</div>
			<button class="calc_btn" onclick="computeIntersection('inter di')">Compute Intersection</button>
		`;
	} else if (optionName === '+/- ang') {
		calcDiv.innerHTML = `
		    <h3>Traverse Manager</h3>
		    <div class="selection_toggle">
		        <button class="tableBtn active_sub" onclick="setTarget('ptA')">Stn A</button>
		        <button class="tableBtn" onclick="setTarget('ptC')">Closing C</button>
		    </div>
		    <div class="form_group">
		        <label>Add Leg (D.MMSS / Dist)</label>
		        <div style="display:flex; gap:5px;">
		            <input id="trv_ang" type="number" placeholder="Angle">
		            <input id="trv_dist" type="number" placeholder="Dist">
		            <button class="tableBtn" onclick="addTrvLeg()">+</button>
		        </div>
		    </div>
		    <ul id="trv_list" class="computation_menu" style="flex-direction:column; max-height:100px; overflow-y:auto;">
		        <li style="border:none; color:#ccc;">No legs added</li>
		    </ul>
		    <button class="calc_btn" onclick="runTraverse()">Adjust & Save</button>
		`;
		window.traverseData.stations = [];
	} else if (optionName === 'cld be') { // Closed/Link Traverse by Bearings
		calcDiv.innerHTML = `
		    <h3>Link Traverse (Adjusted)</h3>
		    <div class="selection_toggle" style="margin-bottom: 10px;">
		        <button type="button" id="btn_stn" class="tableBtn active_sub" onclick="setTarget('stn')">Pick Stn A</button>
		        <button type="button" id="btn_cy" class="tableBtn" onclick="setTarget('cy')">Pick Closing C</button>
		    </div>
		    <div class="form_group">
		        <label>Station A (Y / X)</label>
		        <div style="display:flex; gap:5px;">
		            <input id="stn_y" type="number" step="0.001" placeholder="Y">
		            <input id="stn_x" type="number" step="0.001" placeholder="X">
		        </div>
		    </div>
		    <div class="form_group">
		        <label>Closing Point C (Y/X)</label>
		        <div style="display:flex; gap:5px;">
		            <input id="bs_y" type="number" placeholder="Y">
		            <input id="bs_x" type="number" placeholder="X">
		        </div>
		    </div>
		    <div class="form_group">
		        <label>Start/End Bearings</label>
		        <div style="display:flex; gap:5px;">
		            <div class="input_wrap"><input id="start_brg" type="number" placeholder="Start Brg"></div>
		            <div class="input_wrap"><input id="end_brg" type="number" placeholder="Closing Brg">
		        </div></div>
		    </div>
		    <div class="form_group">
		        <label>Add Leg (D.MMSS / Dist)</label>
		        <div style="display:flex; gap:5px;">
		            <input id="trv_ang" type="number" placeholder="Angle">
		            <input id="trv_dist" type="number" placeholder="Dist">
		            <button class="tableBtn" onclick="addTrvLeg()">+</button>
		        </div>
		    </div>
		    <ul id="trv_list" class="computation_menu" style="flex-direction:column; max-height:100px; overflow-y:auto;"></ul>
		    <div class="form_actions">
				<button type="button" class="secondary_btn" onclick="undoLastLeg()">Undo Last</button>
				<button type="button" class="secondary_btn" style="color: #e74c3c;" onclick="clearTraverseList()">Clear All Legs</button>
			</div>
		    <button class="calc_btn" onclick="runAdjustedTraverse()">Adjust & Save</button>
		`;
	} else if (optionName === 'u be' || optionName === 'u di') {
			const isDir = optionName === 'u di';
			calcDiv.innerHTML = `
				<h3>Unclosed Traverse (${isDir ? 'Directions' : 'Bearings'})</h3>
				<div class="selection_toggle">
				    <button class="tableBtn active_sub" onclick="setTarget('stn')">Pick Stn A</button>
				    ${isDir ? `<button class="tableBtn" onclick="setTarget('bs')">Pick BS</button>` : ''}
				</div>
				<div class="form_group">
				    <label>Station A (Y / X)</label>
				    <div style="display:flex; gap:5px;">
				        <input id="stn_y" type="number" step="0.001" placeholder="Y">
				        <input id="stn_x" type="number" step="0.001" placeholder="X">
				    </div>
				</div>

				<div class="form_group">
				    <label>Backsight B (Y / X)</label>
				    <div style="display:flex; gap:5px;">
				        <input id="bs_y" type="number" step="0.001" placeholder="Y">
				        <input id="bs_x" type="number" step="0.001" placeholder="X">
				    </div>
				</div>
				<div class="form_group">
				    <label>Add Leg (${isDir ? 'Direction' : 'Bearing'} / Dist)</label>
				    <div style="display:flex; gap:5px;">
				        <input id="trv_ang" type="number" step="0.0001" placeholder="D.MMSS">
				        <input id="trv_dist" type="number" step="0.001" placeholder="Dist">
				        <button class="tableBtn" onclick="addTrvLeg()">+</button>
				    </div>
				</div>
				<ul id="trv_list" class="computation_menu" style="flex-direction:column; max-height:100px; overflow-y:auto;"></ul>
		    	<div class="form_actions">
					<button type="button" class="secondary_btn" onclick="undoLastLeg()">Undo Last</button>
					<button type="button" class="secondary_btn" style="color: #e74c3c;" onclick="clearTraverseList()">Clear All Legs</button>
				</div>
				<button class="calc_btn" onclick="runUnclosedTraverse('${isDir ? 'dir' : 'bear'}')">COMPUTE & SAVE</button>
			`;
			window.traverseData.stations = [];
		} else if (optionName === 'cld di') {
		calcDiv.innerHTML = `
		    <h3>Link Traverse (Directions)</h3>
		    <div class="selection_toggle">
		        <button type="button" id="btn_stn" class="tableBtn active_sub" onclick="setTarget('stn')">Pick Stn A</button>
		        <button type="button" id="btn_bs" class="tableBtn" onclick="setTarget('bs')">Pick BS B</button>
		        <button type="button" id="btn_cy" class="tableBtn" onclick="setTarget('cy')">Pick Close C</button>
		    </div>
		    <div class="form_group">
		        <label>Station A / BS B / Close C</label>
		        <div style="display:flex; flex-direction:column; gap:5px;">
		            <div style="display:flex; gap:5px;"><input id="stn_y" placeholder="Stn Y"><input id="stn_x" placeholder="Stn X"></div>
		            <div style="display:flex; gap:5px;"><input id="bs_y" placeholder="BS Y"><input id="bs_x" placeholder="BS X"></div>
		            <div style="display:flex; gap:5px;"><input id="cy_y" placeholder="Close Y"><input id="cy_x" placeholder="Close X"></div>
		        </div>
		    </div>
		    <div class="form_group">
		        <label>Closing Bearing at C (D.MMSS)</label>
		        <input id="end_brg" type="number" step="0.0001" placeholder="Fixed End Bearing">
		    </div>
		    <div class="form_group">
		        <label>Add Leg (Direction / Dist)</label>
		        <div style="display:flex; gap:5px;">
		            <input id="trv_ang" type="number" step="0.0001" placeholder="D.MMSS">
		            <input id="trv_dist" type="number" step="0.001" placeholder="Dist">
		            <button type="button" class="tableBtn" onclick="addTrvLeg()">+</button>
		        </div>
		    </div>
		    <ul id="trv_list" class="computation_menu" style="flex-direction:column; max-height:100px; overflow-y:auto; margin-bottom:10px;"></ul>
		    <div class="form_actions">
				<button type="button" class="secondary_btn" onclick="undoLastLeg()">Undo Last</button>
				<button type="button" class="secondary_btn" style="color: #e74c3c;" onclick="clearTraverseList()">Clear All Legs</button>
			</div>
		    <button type="button" class="calc_btn" onclick="runAdjustedTraverse('dir')">ADJUST & SAVE</button>
		`;
		window.traverseData.stations = [];
	} else if (optionName === 'helm pts') {
		calcDiv.innerHTML = `
		    <h3>Helmert: Pair Control Points</h3>
		    <div class="selection_toggle">
		        <button class="tableBtn active_sub" id="btn_old" onclick="setTarget('old')">Pick Old (Local)</button>
		        <button class="tableBtn" id="btn_new" onclick="setTarget('new')">Pick New (Grid)</button>
		    </div>
		    <div class="form_group">
		        <label>Points to Pair (Select from Table)</label>
		        <ul id="pair_list" class="computation_menu" style="flex-direction:column; max-height:150px; overflow-y:auto;">
		        	<li style="border:none; color:#ccc; list-style:none;">No points paired yet</li>
		        </ul>
		    </div>
		    <button class="calc_btn" onclick="computeHelmertParams()">Calculate Parameters</button>
		`;
		window.helmertPairs = [];
	} else if (optionName === 'Losca') {
		calcDiv.innerHTML = `
			<h3>Lo Scale Factor</h3>
		    <div class="form_group">
		        <label>Y Mean (km)</label>
		        <input id="y_mean_km" type="number" oninput="runLoScale()">
		    </div>
		    <div class="calculator_card"><div id="lo_res" style="font-size:1.5rem;">1.0000000</div></div>
		`;
	} else if (optionName === 'UTMsca') {
		calcDiv.innerHTML = `
			<h3>UTM Scale Factor</h3>
			<div class="form_group">
				<label>Easting Mean (km)</label>
				<input id="e_mean_km" type="number" oninput="runUtmScale()">
			</div>
			<div class="calculator_card"><div id="utm_res" style="font-size:1.5rem;">0.9996000</div></div>
		`;
	} else if (optionName === 'helm param') {
		const p = window.activeHelmertParams || { a:0, b:0, x0:0, y0:0, scale:1, rotation:0 };
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>Helmert Parameters</h3>
		        <div class="calculator_card" style="padding:15px; margin-bottom:15px; font-family:monospace; font-size:13px;">
		            <div>Scale: <b>${p.scale.toFixed(6)}</b></div>
		            <div>Rot: <b>${COGO.degToDms(p.rotation)}</b></div>
		        </div>
		        <div class="form_group">
		            <label>Translation Y0 / X0</label>
		            <div style="display:flex; gap:5px;">
		                <input id="h_y0" type="number" step="0.0001" value="${p.y0.toFixed(4)}" placeholder="Y0">
		                <input id="h_x0" type="number" step="0.0001" value="${p.x0.toFixed(4)}" placeholder="X0">
		            </div>
		        </div>
		        <div class="form_group">
		            <label>Constants a / b</label>
		            <div style="display:flex; gap:5px;">
		                <input id="h_a" type="number" step="0.0000001" value="${p.a.toFixed(8)}" placeholder="a">
		                <input id="h_b" type="number" step="0.0000001" value="${p.b.toFixed(8)}" placeholder="b">
		            </div>
		        </div>
		        <button class="calc_btn" onclick="saveManualParams()">Apply Manual Params</button>
		    </div>
		`;
	} else if (optionName === 'slopesea') {
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>Slope & Sea Level Correction</h3>
		        <div class="form_group">
		            <label>Height at Stn A / Stn B (m)</label>
		            <div style="display:flex; gap:5px;">
		                <input id="h_a" type="number" step="0.01" placeholder="Ht A">
		                <input id="h_b" type="number" step="0.01" placeholder="Ht B">
		            </div>
		        </div>
		        <div class="form_group">
		            <label>Measured Slope Distance (m)</label>
		            <input id="s_dist" type="number" step="0.001" placeholder="Distance">
		        </div>
		        <div class="calculator_card" style="text-align:center; padding:15px; background:rgba(0,0,0,0.02);">
		            <div id="slp_res" style="font-size:1.8rem; font-weight:bold; color:var(--accent-gold);">0.000</div>
		            <div id="slp_corr" style="font-size:0.75rem; color:#666;">CORR: 0.000</div>
		        </div>
		        <button class="calc_btn" style="margin-top:10px;" onclick="calculateSlopeCorrection()">Compute Correction</button>
		    </div>
		`;
	} else if (optionName === 'Lo-UTM') {
		calcDiv.innerHTML = `
			<div class="inner-fade-in">
				<h3>Lo to UTM Conversion</h3>
				<div class="form_group">
				    <label>Origin Central Meridian (Lo)</label>
				    <input id="cm_origin" type="number" placeholder="e.g. 31">
				</div>
				<div class="form_group">
				    <label>Target UTM Zone (CM)</label>
				    <input id="cm_target" type="number" placeholder="e.g. 33">
				</div>
		        <div class="form_group">
		            <label>Coordinates to Convert (Y / X)</label>
		            <div style="display:flex; gap:5px;">
		                <input id="stn_y" type="number" step="0.001" placeholder="Y (Easting)">
		                <input id="stn_x" type="number" step="0.001" placeholder="X (Northing)">
		            </div>
		        </div>
				<div class="selection_toggle">
				    <button class="tableBtn active_sub" onclick="setTarget('stn')">Pick Point</button>
				</div>
				<button class="calc_btn" onclick="runCoordinateTransform('Lo-UTM')">Convert Point</button>
			</div>
		`;
	} else if (optionName === 'UTM-Lo') {
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>UTM to Lo Conversion</h3>
		        <div class="selection_toggle">
		            <button type="button" id="btn_stn" class="tableBtn active_sub" onclick="setTarget('stn')">Pick Point</button>
		        </div>
		        <div class="form_group">
		            <label>Source CM (UTM) / Target CM (Lo)</label>
		            <div style="display:flex; gap:5px;">
		                <input id="cm_origin" type="number" placeholder="UTM CM">
		                <input id="cm_target" type="number" placeholder="Lo CM">
		            </div>
		        </div>
		        <div class="form_group">
		            <label>Source UTM E / N</label>
		            <div style="display:flex; gap:5px;">
		                <input id="stn_y" type="number" step="0.001" placeholder="Easting">
		                <input id="stn_x" type="number" step="0.001" placeholder="Northing">
		            </div>
		        </div>
		        <button class="calc_btn" onclick="runCoordinateTransform('UTM-Lo')">Convert to Lo</button>
		    </div>`;
	} else if (optionName === 'geo-Lo' || optionName === 'geo-UTM') {
		const isLo = optionName === 'geo-Lo';
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>Geographic to ${isLo ? 'Lo' : 'UTM'}</h3>
		        <div class="form_group">
		            <label>Central Meridian (Target)</label>
		            <input id="cm_target" type="number" placeholder="e.g. 31">
		        </div>
		        <div class="form_group">
		            <label>Latitude (S) / Longitude (E)</label>
		            <div style="display:flex; gap:5px;">
		                <input id="geo_lat" type="number" step="0.000001" placeholder="Lat (-15.123)">
		                <input id="geo_lon" type="number" step="0.000001" placeholder="Lon (28.123)">
		            </div>
		        </div>
		        <button class="calc_btn" onclick="runCoordinateTransform('${optionName}')">Convert to ${isLo ? 'Lo' : 'UTM'}</button>
		    </div>`;
	} else if (optionName === 'Units') {
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>Unit Converter</h3>
		        <div class="form_group">
		            <label>Value</label>
		            <input id="conv_val" type="number" step="0.0001" placeholder="Enter length" oninput="runUnitConversion()">
		        </div>
		        <div style="display:flex; gap:10px; margin-bottom:15px;">
		            <div class="form_group" style="flex:1;">
		                <label>From</label>
		                <select id="unit_from" onchange="runUnitConversion()">
		                    <option value="m">Meters (m)</option>
		                    <option value="cft">Cape Feet (cf)</option>
		                    <option value="ft">English Feet (ft)</option>
		                </select>
		            </div>
		            <div class="form_group" style="flex:1;">
		                <label>To</label>
		                <select id="unit_to" onchange="runUnitConversion()">
		                    <option value="cft">Cape Feet (cf)</option>
		                    <option value="m">Meters (m)</option>
		                    <option value="ft">English Feet (ft)</option>
		                </select>
		            </div>
		        </div>
		        <div class="calculator_card" style="text-align:center; padding:20px; background:rgba(0,0,0,0.03);">
		            <div id="conv_result" style="font-size:1.8rem; font-weight:bold; color:var(--accent-gold);">0.000</div>
		            <span id="unit_label" style="font-size:0.8rem; color:#666;">RESULT</span>
		        </div>
		    </div>
		`;
	} else if (optionName === 'DMS-Dec') {
		calcDiv.innerHTML = `
		    <div class="inner-fade-in">
		        <h3>DMS ↔ Decimal Converter</h3>
		        <div class="form_group">
		            <label>DEGREES.MMSS (Input)</label>
		            <input id="input_dms" type="number" step="0.0001" placeholder="e.g. 125.3045">
		        </div>
		        <button class="calc_btn" onclick="runDmsToDec()">TO DECIMAL</button>
		        
		        <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
		        
		        <div class="form_group">
		            <label>DECIMAL DEGREES (Input)</label>
		            <input id="input_dec" type="number" step="0.000001" placeholder="e.g. 125.5125">
		        </div>
		        <button class="calc_btn" style="background:var(--accent-gold);" onclick="runDecToDms()">TO D.MMSS</button>
		        
		        <div class="calculator_card" style="margin-top:20px; text-align:center; padding:15px;">
		            <div id="conv_res_val" style="font-size:1.8rem; font-weight:bold; color:var(--header-bg);">0.000</div>
		            <div id="conv_res_label" style="font-size:0.8rem; color:var(--text-muted);">RESULT</div>
		        </div>
		    </div>
		`;
	} else {
		calcDiv.innerHTML = `<h3>${optionName.toUpperCase()}</h3><p>Form under development.</p>`;
	}
	
	calcDiv.classList.add('fade-in-up'); // Re-apply the animation class
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

function toggleTable(show) {
	const modal = document.getElementById("table_modal");
	show ? modal.classList.add('active_modal') : modal.classList.remove('active_modal');
}

function setTarget(target) {
    currentInputTarget = target;
    // Remove active class from all toggle buttons
    document.querySelectorAll('.selection_toggle .tableBtn').forEach(btn => {
    	btn.classList.remove('active_sub')
    });
    // Add to current
    const activeBtn = document.getElementById('btn_' + target);
    if (activeBtn) activeBtn.classList.add('active_sub');
    
    if (window.innerWidth < 850) toggleTable(true);
}

function addResultToTable(id, ptNo, y, x, level = "0.000") {
	const table = document.querySelector(".data_table tbody");
	if (!table) return;

	// Create a new row
	const row = table.insertRow(-1); // -1 adds it to the bottom
	
	row.setAttribute('data-y', y);
	row.setAttribute('data-x', x);
	row.style.cursor = "pointer";
	
	// Fill the cells
	row.innerHTML = `
		<td><input type="checkbox" class="rowCheck" value="${id}"></td>
		<td>${id}</td>
		<td>${ptNo}</td>
		<td>${parseFloat(y).toFixed(3)}</td>
		<td>${parseFloat(x).toFixed(3)}</td>
		<td>${parseFloat(level).toFixed(3)}</td>
		<td class="action_cell">
			<button class="tableBtn" onclick="event.stopPropagation(); openEditModal(${id}, '${ptNo}', ${y}, ${x}, ${level})" data-tooltip="Edit">
		        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
		    </button>
		    <!-- Delete Icon (Trash) -->
		    <button class="tableBtn delete_icon" onclick="event.stopPropagation(); deletePoint(this, ${id})" data-tooltip="Delete">
		        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
		    </button>
		</td>
	`;
	
	row.onclick = function() {
        const py = parseFloat(this.getAttribute('data-y'));
        const px = parseFloat(this.getAttribute('data-x'));
        const ptNoLabel = this.getAttribute('data-pt');
        const ptName = ptNo;
        
        // 1. Check if 'Area' calculation is active in the menu
        const activeSub = document.querySelector('.computation_menu li.active_sub');
        const isAreaMode = activeSub && activeSub.innerText.toLowerCase().includes('area');

        if (isAreaMode) {
            // BEHAVIOR A: Handle Area Selection (Highlighting)
            if (this.classList.contains('selected_for_area')) {
                this.classList.remove('selected_for_area');
                areaPoints = areaPoints.filter(p => p.y !== py || p.x !== px);
            } else {
                this.classList.add('selected_for_area');
                areaPoints.push({ y: py, x: px });
            }
            updateAreaDisplay();
        } else {
            // BEHAVIOR B: Handle Loading Data into Forms & Helmert Pairing
            const easting = parseFloat(py).toFixed(3);
            const northing = parseFloat(px).toFixed(3);

            // --- HELMERT PAIRING LOGIC ---
            if (currentInputTarget === 'old') {
                window.tempOld = { y: py, x: px, name: ptName };
                setTarget('new'); // Auto-advance to New
                document.getElementById('status_text').innerText = `Old Pt ${ptName} selected. Now pick the New Grid coordinate.`;
            } 
            else if (currentInputTarget === 'new') {
                const newPair = { 
                    oldY: window.tempOld.y, oldX: window.tempOld.x, 
                    newY: py, newX: px,
                    label: `${window.tempOld.name} ➔ ${ptName}`
                };
                
                window.helmertPairs.push(newPair);

                // Update the visual list
                const list = document.getElementById('pair_list');
                if (list) {
                    if (window.helmertPairs.length === 1) list.innerHTML = ""; // Clear placeholder
                    const li = document.createElement('li');
                    li.style = "font-size: 12px; padding: 5px; border-bottom: 1px solid #eee; list-style:none;";
                    li.innerText = newPair.label;
                    list.appendChild(li);
                }

                setTarget('old'); // Reset for next pair
                document.getElementById('status_text').innerText = `Pair added. Total: ${window.helmertPairs.length}`;
            } else {
                if (document.getElementById('stn_y') && currentInputTarget === 'stn') {
                    document.getElementById('stn_y').value = easting;
                    document.getElementById('stn_x').value = northing;
                    setTarget('bs');
                } else if (document.getElementById('bs_y') && currentInputTarget === 'bs') {
                    document.getElementById('bs_y').value = easting;
                    document.getElementById('bs_x').value = northing;
                } else if (document.getElementById('cy_y') && currentInputTarget === 'cy') {
                    document.getElementById('cy_y').value = easting;
                    document.getElementById('cy_x').value = northing;
                }
                
                document.getElementById('status_text').innerText = `Loaded Pt ${ptName} into form`;
            }
            
            if (window.innerWidth < 850) toggleTable(false); 
        }

        // --- TRANSFORMATION PREVIEW LOGIC ---
		if (window.activeHelmertParams) {
		    // Transform the clicked point's coordinates (Line 24410 logic)
		    const transformed = HelmertEngine.transformPoint(px, py, window.activeHelmertParams);
		    
		    // Show the preview in the status bar
		    const previewText = `Preview [${ptName}]: New Y: ${transformed.y.toFixed(3)}, New X: ${transformed.x.toFixed(3)}`;
		    document.getElementById('status_text').innerText = previewText;
		    
		    // Optional: Log it for reference
		    console.log(`Transformed ${ptName}:`, transformed);
		}
    };
	
	// Optional: Highlight the new row briefly
	row.style.backgroundColor = "#fff9e6";
	setTimeout(() => { row.style.backgroundColor = "transparent"; }, 2000);
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

// Add this 'click' listener inside your loop where you generate rows
function addRowClickListeners() {
	const rows = document.querySelectorAll(".data_table tbody tr");
	rows.forEach(row => {
		row.style.cursor = "pointer"; // Visual cue
		row.onclick = function() {
			// Extract data from the row cells
			const ptNo = this.cells[1].innerText;
			const easting = this.cells[2].innerText;
			const northing = this.cells[3].innerText;

			// Fill the active form inputs if they exist
			if (document.getElementById('stn_y')) document.getElementById('stn_y').value = easting;
			if (document.getElementById('stn_x')) document.getElementById('stn_x').value = northing;
			
			// Also works for backsight fields if active
			if (document.getElementById('bs_y')) document.getElementById('bs_y').value = easting;
			if (document.getElementById('bs_x')) document.getElementById('bs_x').value = northing;

			document.getElementById('status_text').innerText = `Loaded Pt ${ptNo} into form`;
			
			// Auto-close modal if on mobile
			if (window.innerWidth < 850) toggleTable(false);
		};
	});
}
	
function exportTableToCSV() {
	let userInput = prompt("Enter a name for your file:", "survey_data");
	
	if (userInput === null || userInput === "");
	let filename = userInput.endsWith(".csv") ? userInput : userInput + ".csv";
	let csv = [];
	// Get all rows from your points table
	const rows = document.querySelectorAll(".table_area table tr");
	
	for (let i = 0; i < rows.length; i++) {
		let row = [], cols = rows[i].querySelectorAll("td, th");
		
		for (let j = 0; j < cols.length; j++) 
			row.push('"' + cols[j].innerText + '"'); // Wrap in quotes to handle commas
		
		csv.push(row.join(","));        
	}

	// Create a Blob and trigger download
	const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
	const downloadLink = document.createElement("a");

	downloadLink.download = filename;
	downloadLink.href = window.URL.createObjectURL(csvFile);
	downloadLink.style.display = "none";
	document.body.appendChild(downloadLink);

	downloadLink.click();
	
	// Cleanup: remove the link after clicking
    document.body.removeChild(downloadLink);
    
	document.getElementById('status_text').innerText = "File exported: " + filename;
}

async function deletePoint(btn, id) {
    // 1. Find the point name from the row
    const row = btn.closest('tr');
    const ptNo = row.cells[2].innerText;
    
    // 2. Store the ID and show the modal
    pointToDelete = id;
    document.getElementById('del_pt_name').innerText = ptNo;
    document.getElementById('deleteModal').style.display = 'flex';
    
    // 3. Set up the confirm button's one-time click event
    document.getElementById('confirmDeleteBtn').onclick = async function() {
        try {
            const response = await fetch(`/api/points/${pointToDelete}`, { method: 'DELETE' });
            if (response.ok) {
                closeDeleteModal();
                loadPoints(); // Refresh the table
                document.getElementById('status_text').innerText = `Point ${ptNo} deleted.`;
            } else {
                alert("Unauthorized: Only admins can delete points.");
            }
        } catch (err) { console.error(err); }
    };
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    pointToDelete = null;
}

async function editPoint(id, oldPtNo, oldY, oldX, oldZ) {
    const newPtNo = prompt("New Point Number:", oldPtNo);
    if (!newPtNo) return;

    const data = {
        pt_no: newPtNo,
        easting: oldY,
        northing: oldX,
        elevation: oldZ
    };

    try {
        const response = await fetch(`/api/points/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            loadPoints(); // Refresh the table to show updated data
            document.getElementById('status_text').innerText = "Point updated.";
        }
    } catch (err) {
        console.error("Update failed:", err);
    }
}

async function savePointToDB(ptData) {
	try {
		const response = await fetch('/api/points', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(ptData)
		});
		
		const savedPt = await response.json();
		const p = Array.isArray(savedPt) ? savedPt[0] : savedPt;
		
		addResultToTable(p.id, p.pt_no, p.easting, p.northing, p.elevation);
		document.getElementById('status_text').innerText = `Saved Pt ${savedPt.pt_no} to Database`;
	} catch(err) {
		console.error('Error saving point:', err);
	}
}

async function loadPoints(page = 1, search = '', onlyMine = false) {
    //const url = onlyMine ? '/api/my-points' : '/api/points';
    const status = document.getElementById('status_text');
    
    // Build the query parameter URL cleanly based on selected scope
    let url = onlyMine 
        ? `/api/my-points?page=${page}&limit=10&search=${encodeURIComponent(search)}`
        : `/api/points?page=${page}&limit=10&search=${encodeURIComponent(search)}`;
    
    try {
        const response = await fetch(url);
        if (response.status === 401) {
        	status.innerText = "Session expired. Please login.";
        	return showLoginModal();
        }
        
        const data = await response.json();
        
        allPointsData = data.points || data;
        currentPage = data.currentPage || page;
        totalPagesCount = data.totalPages || 1;
        
        displayPage(currentPage);
        //updatePaginationControls()
        
        status.innerText = "Database Loaded Successfully";
    } catch (err) {
        console.error("Load error:", err);
        status.innerText = "Error: Database Link Failed";
    }
}

function displayPage(page) {
    const tableBody = document.querySelector(".data_table tbody");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";	// Clear the existing rows before drawing new ones

    // Calculate start and end indices
    const start = (page - 1) * pointsPerPage;
    const end = start + pointsPerPage;
    const pageData = allPointsData.slice(start, end);

    pageData.forEach(p => {
        addResultToTable(p.id, p.pt_no, p.easting, p.northing, p.elevation);
    });

    // Update UI info
    currentPage = page;
    const totalPages = Math.ceil(allPointsData.length / pointsPerPage) || 1;
    document.getElementById('pageInfo').innerText = `Page ${page} of ${Math.ceil(allPointsData.length / pointsPerPage)}`;
    
    // Disable buttons if at boundaries
    document.getElementById('prevPage').disabled = (page === 1);
    document.getElementById('nextPage').disabled = (page >= totalpagesCount);
}

function changePage(step) {
    currentPage += step;
    displayPage(currentPage);
}

window.onload = async () => {
	initMap();	// Start the map first
    // A. SESSION CHECK
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (data.loggedIn) {
            document.getElementById('status_text').innerText = `Logged in as ${data.username}`;
            loadPoints();
            renderMapPoints();	// I added this
        } else {
            toggleLoginModal(true);
        }
    } catch (err) {
    	console.error("Session check failed:", err);
        toggleLoginModal(true);
    } 

    // B. UI RESET
    const searchBar = document.getElementById('searchInput');
    if (searchBar) searchBar.value = "";

    window.traverseData = { stations: [] };
    window.helmertPairs = []; // Reset transformation data too

    const fieldsToClear = ['stn_y', 'stn_x', 'bs_y', 'bs_x', 'cy_y', 'cy_x', 'end_brg', 'trv_ang', 'trv_dist'];
    fieldsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    //document.getElementById('status_text').innerText = "System Ready";
};


function resetArea() {
    areaPoints = [];
    document.querySelectorAll('.selected_for_area').forEach(row => {
        row.classList.remove('selected_for_area');
    });
    updateAreaDisplay();
}

async function login(username, password) {
	const response = await fetch('/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	if (response.ok) {
		document.getElementById('status_text').innerText = "Logged in as " + username;
		// Reload points for this specific user
	} else {
		alert("Login failed");
	}
}

async function registerUser() {
    // 1. Get references to the input elements themselves
    const userField = document.getElementById('reg_user');
    const passField = document.getElementById('reg_pass');

    const user = userField.value;
    const pass = passField.value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        if (response.ok) {
            alert("Registration successful! You can now log in.");
            toggleRegModal(false);
        } else {
            alert("Registration failed. Username might be taken.");
        }
    } catch (error) {
        console.error("Network error during registration:", error);
        alert("A network error occurred. Please try again.");
    } finally {
        // 2. CLEAR CREDENTIALS HERE (Runs automatically on success, failure, or crash)
        userField.value = '';
        passField.value = '';
    }
}

function toggleRegModal(show) {
    const regModal = document.getElementById('register_modal');
    const loginModal = document.getElementById('loginModal');
    const overlay = document.getElementById('modalOverlay');
    const display = show ? 'block' : 'none';

    // 1. Show/Hide the registration modal and overlay
    regModal.style.display = display;
    overlay.style.display = display;

    // 2. If opening registration, hide the login modal automatically
    if (show) {
        loginModal.style.display = 'none';
    }
}

// Toggle Modal Visibility
function toggleLoginModal(show) {
	const modal = document.getElementById('loginModal');
	const overlay = document.getElementById('modalOverlay');
	const display = show ? 'block' : 'none';
	
	modal.style.display = display;
	overlay.style.display = display;
}

// Attach to Header Button
document.getElementById('loginBtn').onclick = () => toggleLoginModal(true);

// Handle Login Submission
async function handleLogin(e) {
	e.preventDefault();
	const user = document.getElementById('login_user').value;
	const pass = document.getElementById('login_pass').value;

	try {
		const response = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: user, password: pass })
		});

		if (response.ok) {
			const data = await response.json();
			toggleLoginModal(false);
			document.getElementById('status_text').innerText = `Logged in as ${user} (${data.role})`;
			document.getElementById('loginBtn').innerText = "LOGOUT";
			document.getElementById('loginBtn').onclick = handleLogout;
		} else {
			alert("Invalid username or password!");
		}
	} catch (err) {
		console.error("Login network error:", err);
	}
}

async function handleLogout() {
	// Tell the server to destroy the session
	try {
		const response = await fetch('/api/logout', { method: 'POST' });
		if (response.ok) {
			// Clear session and reset button
			location.reload();
		} else {
			console.error("Logout failed on server");
			// Force reload anyway to reset UI
			location.reload();
		}
	} catch (err) {
		console.error("Logout network error:", err);
		location.reload();
	}
	 
}

// Attach this to your search bar in HTML or via JS
document.getElementById('searchInput').addEventListener('input', debounce(function() {
    currentSearchTerm = this.value;
    
    loadPoints(1, currentSearchTerm, false);
}, 300)); // 300ms delay: waits until user stops typing for a split second

// Simple utility function to prevent flooding your server with database requests
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
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

// Bulk Delete Logic
async function bulkDelete() {
    const checked = Array.from(document.querySelectorAll('.rowCheck:checked')).map(cb => cb.value);
    if (checked.length === 0) return alert("Select points first!");
    if (!confirm(`Delete ${checked.length} points permanently?`)) return;

    try {
        const response = await fetch('/api/points/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: checked })
        });
        if (response.ok) {
            loadPoints(); // Refresh table
            document.getElementById('status_text').innerText = "Bulk delete successful.";
        }
    } catch (err) { console.error(err); }
}

// Edit Modal Handlers
function openEditModal(id, pt_no, y, x, z) {
    document.getElementById('edit_id').value = id;
    document.getElementById('edit_pt_no').value = pt_no;
    document.getElementById('edit_y').value = y;
    document.getElementById('edit_x').value = x;
    document.getElementById('edit_z').value = z;
    document.getElementById('editModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
}

function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.rowCheck');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
    });
}

async function handleUpdate(event) {
    event.preventDefault();

    // 1. Get the data from the dialog box inputs
    const id = document.getElementById('edit_id').value;
    const pt_no = document.getElementById('edit_pt_no').value;
    const easting = parseFloat(document.getElementById('edit_y').value);
    const northing = parseFloat(document.getElementById('edit_x').value);
    const elevation = parseFloat(document.getElementById('edit_z').value);

    // 2. Send the updated data to the server
    try {
        const response = await fetch(`/api/points/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pt_no, easting, northing, elevation })
        });

        if (response.ok) {
            const updatedPoint = await response.json();
            
            // 3. Close the modal and show success
            closeEditModal();
            document.getElementById('status_text').innerText = `Point ${pt_no} updated successfully.`;
            
            // 4. Refresh the table to show the new values
            loadPoints(); 
        } else {
            const errorData = await response.json();
            alert("Update failed: " + errorData.error);
        }
    } catch (err) {
        console.error("Update Error:", err);
        alert("An error occurred while updating the point.");
    }
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

/**
 * Handles the measurement logic when a map or marker is clicked
 */
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

/**
 * Helper to calculate Geodetic Bearing
 */
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
    measurePoints = [];
    if (measureLine) map.removeLayer(measureLine);
    
    if (window.isMeasuring) {
        map.getContainer().style.cursor = 'crosshair';
        document.getElementById('status_text').innerText = "Measure Tool Active: Click first point.";
    } else {
        map.getContainer().style.cursor = '';
        document.getElementById('status_text').innerText = "Measure Tool Disabled.";
    }
}

async function fetchAndRenderTable(page = 1, search = '') {
    try {
        // Pass both pagination constraints AND search parameters to Express
        const response = await fetch(`/api/survey-points?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
        const data = await response.json();
        
        // Your code to rebuild the <tr> table rows goes here...
        // renderTableRows(data.points);
        // updatePaginationUI(data.currentPage, data.totalPages);
        
    } catch (err) {
        console.error("Error loading paginated global table:", err);
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
