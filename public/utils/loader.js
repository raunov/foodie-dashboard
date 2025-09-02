export function showLoader() {
    const loader = document.getElementById('loader-container');
    if (loader) {
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        loader.style.visibility = 'visible';
    }
}

export function hideLoader() {
    const loader = document.getElementById('loader-container');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.visibility = 'hidden';
            loader.style.display = 'none';
        }, 300);
    }
}
