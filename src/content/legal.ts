export const legalPages = {
  terms: { title: 'Términos de uso', heading: 'THE FINE PRINT.', intro: 'Esta es una vista previa de deipo. para evaluar el diseño y la experiencia de compra.', sections: [
    ['Alcance de esta versión', 'Los productos, disponibilidad y precios se muestran con fines de demostración. No se procesan cobros ni se aceptan pedidos reales.'],
    ['Pendiente antes del lanzamiento', 'Identidad legal del vendedor, medios de contacto, condiciones comerciales y jurisdicción aplicable. El texto definitivo requiere revisión legal.'],
  ] },
  privacy: { title: 'Privacidad', heading: 'YOUR DETAILS. RESPECTED.', intro: 'La privacidad empieza por pedir solo lo necesario y explicar para qué.', sections: [
    ['Datos durante la prueba', 'El checkout mantiene nombre, teléfono, correo y dirección en memoria del navegador durante esta visita para mostrar el recibo. No se envían a un servidor ni se guardan en el almacenamiento del navegador. Se pierden al recargar o cerrar la página.'],
    ['Preferencias y formularios', 'Solo cantidad, selección de productos, modalidad, zona y horario se conservan en sessionStorage durante la sesión. El formulario de próximos drops valida y descarta los datos; no suscribe a ninguna lista.'],
    ['Medición', 'Esta versión no carga rastreadores publicitarios ni envía eventos de analítica. Un futuro servicio requerirá definir consentimiento, proveedores, retención y derechos antes del lanzamiento. El proveedor de hosting puede registrar datos técnicos de las solicitudes.'],
  ] },
  orders: { title: 'Política de pedidos', heading: 'LIMITED. BY DESIGN.', intro: 'La experiencia gira alrededor de un drop, una capacidad definida y una ventana de entrega.', sections: [
    ['Pedidos de demostración', 'Completar el checkout de esta versión solo genera un recibo de prueba. No reserva unidades, no compromete una fecha y no genera obligaciones de entrega.'],
    ['Pendiente antes del lanzamiento', 'Fecha, producto y precio finales; cobertura; dirección de pickup; disponibilidad real de horarios; cargos adicionales, cancelaciones, cambios, reembolsos y atención de incidencias.'],
  ] },
  quality: { title: 'Política de calidad', heading: 'EVERY DETAIL COUNTS.', intro: 'Producto, temperatura, textura y presentación forman parte de la misma experiencia.', sections: [
    ['Producto ilustrativo', 'Las fotografías y descripciones son conceptos del drop. La receta, las porciones y la información de alérgenos están por confirmar. Esta vista previa no debe utilizarse para tomar decisiones alimentarias.'],
    ['Pendiente antes del lanzamiento', 'Información de ingredientes y alérgenos, manipulación y conservación, desempeño del empaque en entrega y procedimiento de atención a problemas de calidad. No se publican garantías comerciales definitivas en esta versión.'],
  ] },
} as const;
