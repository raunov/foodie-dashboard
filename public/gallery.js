let galleryInstance = null;

function openPhotoGallery(photoUrls, startIndex = 0) {
    if (galleryInstance) {
        galleryInstance.destroy();
    }
    galleryInstance = new PhotoGallery(photoUrls, startIndex);
    galleryInstance.init();
}

class PhotoGallery {
    constructor(photoUrls, startIndex) {
        this.photoUrls = photoUrls;
        this.currentIndex = startIndex;
        this.modalElement = null;
        this.imageElement = null;

        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    init() {
        this.createModal();
        document.body.appendChild(this.modalElement);
        document.addEventListener('keydown', this.handleKeyDown);
        this.show();
    }

    createModal() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'photo-gallery-modal';
        this.modalElement.innerHTML = `
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <button class="nav-button prev-button">&#10094;</button>
                <img src="" alt="Gallery image">
                <button class="nav-button next-button">&#10095;</button>
            </div>
        `;

        this.imageElement = this.modalElement.querySelector('img');

        this.modalElement.querySelector('.close-button').addEventListener('click', () => this.hide());
        this.modalElement.querySelector('.prev-button').addEventListener('click', () => this.showPrev());
        this.modalElement.querySelector('.next-button').addEventListener('click', () => this.showNext());
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.hide();
            }
        });
    }

    show() {
        this.updateImage();
        this.modalElement.classList.add('show');
        this.updateNavButtons();
    }

    hide() {
        this.modalElement.classList.remove('show');
        document.removeEventListener('keydown', this.handleKeyDown);
        setTimeout(() => {
            if (this.modalElement.parentNode) {
                this.modalElement.parentNode.removeChild(this.modalElement);
            }
            galleryInstance = null;
        }, 300);
    }

    destroy() {
        if (this.modalElement && this.modalElement.parentNode) {
            this.modalElement.parentNode.removeChild(this.modalElement);
        }
        document.removeEventListener('keydown', this.handleKeyDown);
        galleryInstance = null;
    }

    updateImage() {
        this.imageElement.src = this.photoUrls[this.currentIndex];
    }

    showPrev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateImage();
            this.updateNavButtons();
        }
    }

    showNext() {
        if (this.currentIndex < this.photoUrls.length - 1) {
            this.currentIndex++;
            this.updateImage();
            this.updateNavButtons();
        }
    }

    updateNavButtons() {
        this.modalElement.querySelector('.prev-button').style.display = this.currentIndex === 0 ? 'none' : 'block';
        this.modalElement.querySelector('.next-button').style.display = this.currentIndex === this.photoUrls.length - 1 ? 'none' : 'block';
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.hide();
        } else if (e.key === 'ArrowLeft') {
            this.showPrev();
        } else if (e.key === 'ArrowRight') {
            this.showNext();
        }
    }
}

// Make openPhotoGallery globally available
window.openPhotoGallery = openPhotoGallery;
