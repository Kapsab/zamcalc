let currentSearchTerm = '';
let totalPagesCount = 1;
let currentPage = 1;
let allPointsData = [];
let pointToDelete = null;
const pointsPerPage = 15;

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
    const status = document.getElementById('status_text');
    
    // 1. Safeguard: Check if we actually have any coordinate data arrays loaded
    if (!allPointsData || allPointsData.length === 0) {
        if (status) status.innerText = "❌ Export Failed: No survey data rows available to compile.";
        alert("There is no point data loaded in the table to export!");
        return;
    }

    // 2. Define clean land surveying header fields (No Action button columns!)
    let csvContent = "Point ID,Easting (Y),Northing (X),Elevation (Z)\n";

    // 3. Sequential formatting loop: Build strings straight from raw memory array data variables
    allPointsData.forEach(p => {
        // Strip out line breaks, spaces, or stray commas inside your text point numbers
        const cleanPtNo = p.pt_no ? p.pt_no.toString().replace(/,/g, ' ').trim() : 'Unnamed';
        const easting = parseFloat(p.easting).toFixed(3);
        const northing = parseFloat(p.northing).toFixed(3);
        const elevation = parseFloat(p.elevation || 0.000).toFixed(3);

        csvContent += `"${cleanPtNo}",${easting},${northing},${elevation}\n`;
    });

    try {
        // 4. Wrap text as a proper binary data stream blob mapping
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        
        // Construct unique file signature matching local timestamps
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `ZAMBAS_SurveyData_${timestamp}.csv`;

        if (navigator.msSaveBlob) { // Ancient IE compatibility safeguard
            navigator.msSaveBlob(blob, filename);
        } else {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        if (status) status.innerText = `🎉 Successfully exported data to ${filename}`;
    } catch (err) {
        console.error("CSV compilation download crashed:", err);
        if (status) status.innerText = "❌ Export Error: File download block failed.";
    }
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

function initTableSearchListener() {
	const searchInput = document.getElementById('searchInput');
	if (!searchInput) return;
	
	searchInput.addEventListener('input', debounce(function() {
    	currentSearchTerm = this.value;
    
    	loadPoints(1, currentSearchTerm, false);
	}, 300));
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

async function loadPoints(page = 1, search = '', onlyMine = false) {
    const status = document.getElementById('status_text');
    let url = onlyMine 
        ? `/api/my-points?page=${page}&limit=10&search=${encodeURIComponent(search)}`
        : `/api/points?page=${page}&limit=10&search=${encodeURIComponent(search)}`;
    
    try {
        const response = await fetch(url, { credentials: 'include' });
        if (response.status === 401) {
        	status.innerText = "Session expired. Please login.";
        	if (typeof toggleLoginModal === 'function') toggleLoginModal(true);
            return;
        }
        
        const data = await response.json();
        
        allPointsData = data.points || data;
        currentPage = data.currentPage || page;
        totalPagesCount = data.totalPages || 1;
        
        displayPage(currentPage);
        if (typeof updatePaginationControls === 'function') { updatePaginationControls(); }
        if (typeof renderMapPoints === "function") { renderMapPoints(allPointsData); }
        
        if (status) status.innerText = "Database Loaded Successfully";
        
        //return allPointsData;
    } catch (err) {
        console.error("Load error:", err);
        status.innerText = "Error: Database Link Failed";
    }
}

function displayPage(page) {
    const tableBody = document.querySelector(".data_table tbody");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";	// Clear the existing rows before drawing new ones

    allPointsData.forEach(p => {
        addResultToTable(p.id, p.pt_no, p.easting, p.northing, p.elevation);
    });

    // Update UI info
    currentPage = page;
    
    const pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl) { pageInfoEl.innerText = `Page ${page} of ${totalPagesCount}`; }
    
    // Disable buttons if at boundaries
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (prevBtn) prevBtn.disabled = (page === 1);
    if (nextBtn) nextBtn.disabled = (page >= totalPagesCount);
}

function nextPage() {
	const targetPage = parseInt(currentPage) || 1;
	const maxPages = parseInt(totalPagesCount) || 1;
	
    if (targetPage < maxPages) {
        loadPoints(targetPage + 1, currentSearchTerm, false);
    } else {
    	console.log("Pagination: Already standing on the final database entry line row.");
    }
}

function prevPage() {
    const targetPage = parseInt(currentPage) || 1;
    if (targetPage > 1) {
        loadPoints(targetPage - 1, currentSearchTerm, false);
    }
}

function updatePaginationControls() {
    // Synchronize boundaries cleanly matching variables
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (prevBtn) prevBtn.disabled = (currentPage === 1);
    if (nextBtn) nextBtn.disabled = (currentPage >= totalPagesCount);
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

async function handleBulkCSVUpload(event) {
    const file = event.target.files[0];
    const status = document.getElementById('status_text');
    if (!file) return;

    status.innerText = "Parsing uploaded file data records...";
    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/);
        const uploadedPoints = [];

        // Loop through each text line (Skipping row 1 if it contains alphabetical header text strings)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const columns = line.split(',');
            // Schema format structure check: pt_no, easting, northing, elevation
            const pt_no = columns[0]?.trim();
            const easting = parseFloat(columns[1]);
            const northing = parseFloat(columns[2]);
            const elevation = parseFloat(columns[3]) || 0.000;

            // Basic safety verification: ensure coordinate components are valid metric floating values
            if (pt_no && !isNaN(easting) && !isNaN(northing)) {
                // Skip text header descriptors like 'pt_no' or 'Easting'
                if (pt_no.toLowerCase() === 'pt_no' || pt_no.toLowerCase() === 'point') continue;
                
                uploadedPoints.push({ pt_no, easting, northing, elevation });
            }
        }

        if (uploadedPoints.length === 0) {
            status.innerText = "❌ Upload Failed: No valid coordinate rows detected.";
            return;
        }

        status.innerText = `Uploading ${uploadedPoints.length} points to server repository...`;
        
        // Loop sequentially through parsed inputs and execute automated saves
        let successCount = 0;
        for (const pt of uploadedPoints) {
            try {
                const response = await fetch('/api/points', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pt)
                });
                
                if (response.ok) successCount++;
            } catch (err) {
                console.error(`Failed to inject line point: ${pt.pt_no}`, err);
            }
        }

        status.innerText = `🎉 Successfully imported ${successCount} out of ${uploadedPoints.length} survey points!`;
        
        // Re-trigger global viewports updates to refresh layouts
        if (typeof loadPoints === 'function') loadPoints(1, '', false);
        if (typeof renderMapPoints === 'function') renderMapPoints();
        
        // Reset the file field container
        event.target.value = '';
    };

    reader.readAsText(file);
}

function updateModalSRID(srid) {
    document.getElementById('edit_srid').value = srid;
    
    const wgsBtn = document.getElementById('btn_wgs');
    const arcBtn = document.getElementById('btn_arc');
    
    if (srid === 4326) {
        wgsBtn.classList.add('active_sub');
        arcBtn.classList.remove('active_sub');
    } else {
        arcBtn.classList.add('active_sub');
        wgsBtn.classList.remove('active_sub');
    }
}
