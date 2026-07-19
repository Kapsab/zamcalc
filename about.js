function openAboutModal() {
    document.getElementById("aboutModal").style.display = "block";
}

function closeAboutModal() {
    document.getElementById("aboutModal").style.display = "none";
}

window.onclick = function(event) {
	let modal = document.getElementById("aboutModal");
	if (event.target == modal) {
		modal.style.display = "none";
	}
}