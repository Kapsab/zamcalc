let currentSearchTerm = '';
let totalPagesCount = 1;

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
        updatePaginationControls();
        
        if (typeof renderMapPoints === "function") { renderMapPoints(allPointsData); }
        
        if (status) status.innerText = "Database Loaded Successfully";
        
        return allPointsData;
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
    if (currentPage < totalPagesCount) {
        loadPoints(currentPage + 1, currentSearchTerm, false);
    }
}

function prevPage() {
    if (currentPage > 1) {
        loadPoints(currentPage - 1, currentSearchTerm, false);
    }
}
