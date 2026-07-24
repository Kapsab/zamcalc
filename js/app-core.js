let currentInputTarget = 'stn'; //Default target

const tabOptions = {
	tab_radiation: ["r be", "r di", "r ecc", "seto be", "seto di", "area"],
	tab_resection: ["res dir", "res dist", "inter di", "inter be"],
	tab_traverse: ["+/- ang", "u be", "u di", "cld be", "cld di", "ed", "c", "d"],
	tab_transformation: ["helm pts", "helm param", "Losca", "UTMsca", "slopesea"],
	tab_conversion: ["Lo-UTM", "UTM-Lo", "geo-Lo", "geo-UTM", "DMS-Dec", "Units"]
};

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

window.onload = async () => {
	initMap();	// Start the map first
    // A. SESSION CHECK
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (data.loggedIn) {
            document.getElementById('status_text').innerText = `Logged in as ${data.username}`;
            
            if (typeof renderMapPoints === 'function') renderMapPoints();
            if (typeof loadPoints === 'function') loadPoints(1, '', false);
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
};