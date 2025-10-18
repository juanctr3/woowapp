jQuery(document).ready(function($) {
    'use strict';

    // Función para enviar los datos al servidor (es la misma para ambos métodos)
    function sendCaptureRequest(data, lastHash) {
        $.ajax({
            url: wseProCapture.ajax_url,
            type: 'POST',
            data: data,
            success: function(response) {
                if (response.success && response.data.captured) {
                    lastHash.data = JSON.stringify(data); // Actualizar el hash
                    console.log('WooWApp: Carrito capturado (Universal)', response.data.cart_id);
                }
            },
            error: function(xhr, status, error) {
                console.error('WooWApp: Error al capturar carrito:', error);
            }
        });
    }

    // --- LÓGICA PARA CHECKOUT TRADICIONAL (CON JQUERY) ---
    function initTraditionalCheckoutCapture() {
        console.log('WooWApp: Detectado Checkout Tradicional');
        let captureTimeout = null;
        let lastCapturedData = { data: null }; // Usamos un objeto para pasarlo por referencia

        function captureCart() {
            var formData = $('form.checkout').serialize();
            formData += '&action=wse_pro_capture_cart';
            formData += '&nonce=' + wseProCapture.nonce;

            if (formData.indexOf('billing_email=') === -1 && formData.indexOf('billing_phone=') === -1) {
                return;
            }

            if (formData === lastCapturedData.data) {
                return; // No ha cambiado
            }
            
            // Enviar datos (formato de cadena)
            sendCaptureRequest(formData, lastCapturedData);
        }

        function scheduleCapture() {
            clearTimeout(captureTimeout);
            captureTimeout = setTimeout(captureCart, 2000); // 2 segundos de espera
        }

        $(document).on('input change', 'form.checkout input, form.checkout select', scheduleCapture);
        $(document.body).on('updated_checkout', scheduleCapture);
    }

    // --- LÓGICA PARA CHECKOUT DE BLOQUES (CON API DE WOOCOMMERCE) ---
    function initBlockCheckoutCapture() {
        console.log('WooWApp: Detectado Checkout de Bloques');
        
        // Verificar que la API de bloques de Woo exista
        if (typeof wc === 'undefined' || typeof wc.data === 'undefined' || typeof wc.blocksData === 'undefined') {
            console.warn('WooWApp: wc.data o wc.blocksData no está disponible. Reintentando...');
            setTimeout(initBlockCheckoutCapture, 500); // Reintentar
            return;
        }

        let captureTimeout = null;
        let lastCapturedData = { data: null }; // Usamos un objeto
        const { select, subscribe } = wc.data;
        const CHECKOUT_STORE_KEY = wc.blocksData.CHECKOUT_STORE_KEY;

        // Nos "subscribimos" a cualquier cambio en los datos del checkout
        subscribe(function() {
            // Esta función se dispara CADA VEZ que el usuario teclea una letra.
            // Es crucial usar un "debounce" (retraso) para no colapsar el servidor.
            
            clearTimeout(captureTimeout);
            captureTimeout = setTimeout(function() {
                
                // Obtenemos los datos de facturación de la "tienda" de datos de Woo
                const billingAddress = select(CHECKOUT_STORE_KEY).getBillingAddress();

                if (!billingAddress.email && !billingAddress.phone) {
                    return; // No hay datos mínimos
                }

                // Mapeamos los datos al formato que nuestro PHP espera (ej. 'billing_phone')
                const postData = {
                    action: 'wse_pro_capture_cart',
                    nonce: wseProCapture.nonce,
                    billing_first_name: billingAddress.first_name || '',
                    billing_last_name: billingAddress.last_name || '',
                    billing_email: billingAddress.email || '',
                    billing_phone: billingAddress.phone || '',
                    billing_address_1: billingAddress.address_1 || '',
                    billing_address_2: billingAddress.address_2 || '',
                    billing_city: billingAddress.city || '',
                    billing_state: billingAddress.state || '',
                    billing_postcode: billingAddress.postcode || '',
                    billing_country: billingAddress.country || '',
                    billing_company: billingAddress.company || ''
                };
                
                const dataHash = JSON.stringify(postData);
                if (dataHash === lastCapturedData.data) {
                    return; // No ha cambiado
                }

                // Enviar datos (formato de objeto)
                sendCaptureRequest(postData, lastCapturedData);

            }, 2000); // 2 segundos de espera después de la última tecla
        });
    }

    // --- DETECCIÓN E INICIO ---
    // Esperamos un momento para que la página (especialmente los bloques) termine de cargar
    setTimeout(function() {
        if ($('.wc-block-checkout').length > 0) {
            // Si existe la clase .wc-block-checkout, usamos la lógica de Bloques
            initBlockCheckoutCapture();
        } else if ($('form.checkout').length > 0) {
            // Si existe form.checkout, usamos la lógica Tradicional
            initTraditionalCheckoutCapture();
        } else {
            console.warn('WooWApp: No se pudo detectar un formulario de checkout conocido.');
        }
    }, 500);
});