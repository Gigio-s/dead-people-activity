/**
 * Dead People Activity - Main Script
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // Configurazione Menu Hamburger Mobile
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const body = document.querySelector('body');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
            
            // Impedisce lo scroll della pagina quando il menu è aperto
            if (navMenu.classList.contains('active')) {
                body.style.overflow = 'hidden';
            } else {
                body.style.overflow = 'initial';
            }
        });

        // Chiude il menu se si clicca su un link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
                body.style.overflow = 'initial';
            });
        });
    }

    // Gestione invio Form "Apparire" (Simulazione Client-Side)
    const mediaForm = document.getElementById('undergroundForm');
    if (mediaForm) {
        mediaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Fixato l'apice con l'escape \' e aggiornato il brand
            alert('Richiesta inviata con successo all\'archivio di Dead People Activity. I dati verranno elaborati per il registro europeo.');
            mediaForm.reset();
        });
    }
});