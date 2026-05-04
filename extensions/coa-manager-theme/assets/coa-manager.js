document.addEventListener('DOMContentLoaded', () => {
  // =============================================
  // LIGHTBOX
  // =============================================
  const lightbox = document.getElementById('coa-lightbox');
  const lightboxImg = document.getElementById('coa-lightbox-img');
  const closeBtn = document.querySelector('.coa-lightbox-close');
  const prevBtn = document.querySelector('.coa-lightbox-prev');
  const nextBtn = document.querySelector('.coa-lightbox-next');

  if (!lightbox) return;

  // Load image URLs from the JSON script tag
  let imageUrls = [];
  let currentIndex = 0;
  const dataEl = document.getElementById('coa-image-data');
  if (dataEl) {
    try {
      imageUrls = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error('Failed to parse COA image data', e);
    }
  }

  const updateNav = () => {
    if (prevBtn) prevBtn.style.display = imageUrls.length > 1 ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = imageUrls.length > 1 ? 'block' : 'none';
  };

  const openLightbox = (index) => {
    currentIndex = index;
    lightboxImg.src = imageUrls[currentIndex] || '';
    lightbox.style.display = 'flex';
    updateNav();
  };

  const closeLightbox = () => {
    lightbox.style.display = 'none';
    lightboxImg.src = '';
  };

  // Attach click handlers to all view buttons
  document.querySelectorAll('.coa-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const index = parseInt(btn.getAttribute('data-coa-index'), 10);
      if (!isNaN(index) && imageUrls[index]) {
        openLightbox(index);
      }
    });
  });

  // Navigation
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
      lightboxImg.src = imageUrls[currentIndex] || '';
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentIndex = (currentIndex + 1) % imageUrls.length;
      lightboxImg.src = imageUrls[currentIndex] || '';
    });
  }

  closeBtn.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.style.display !== 'flex') return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && prevBtn) prevBtn.click();
    if (e.key === 'ArrowRight' && nextBtn) nextBtn.click();
  });

  // =============================================
  // COA REQUEST (Product Page)
  // =============================================
  const requestBtn = document.getElementById('coa-request-btn');
  const requestEmail = document.getElementById('coa-request-email');
  const requestStatus = document.getElementById('coa-request-status');

  if (requestBtn && requestEmail) {
    requestBtn.addEventListener('click', async () => {
      const email = requestEmail.value.trim();
      if (!email) {
        showRequestStatus('Please enter a valid email address.', 'error');
        return;
      }

      // Simple email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showRequestStatus('Please enter a valid email address.', 'error');
        return;
      }

      const productId = requestBtn.getAttribute('data-product-id');
      requestBtn.disabled = true;
      requestBtn.textContent = 'Sending...';
      showRequestStatus('Sending COA to your email...', 'info');

      try {
        const response = await fetch('/apps/coa-lookup/request-coa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, email })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showRequestStatus('✅ COA has been sent to your email!', 'success');
          requestBtn.textContent = 'COA Sent!';
        } else {
          showRequestStatus(data.error || 'Failed to send COA. Please try again.', 'error');
          requestBtn.disabled = false;
          requestBtn.textContent = 'Request COA';
        }
      } catch (err) {
        console.error('COA request error:', err);
        showRequestStatus('An error occurred. Please try again later.', 'error');
        requestBtn.disabled = false;
        requestBtn.textContent = 'Request COA';
      }
    });
  }

  function showRequestStatus(message, type) {
    if (!requestStatus) return;
    requestStatus.style.display = 'block';
    requestStatus.textContent = message;
    requestStatus.style.color = type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#555';
  }
});
