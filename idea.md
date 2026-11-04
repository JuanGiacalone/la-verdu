# La verdu

La idea es un asistente para fruterias y verdulerias que sea capaz de gestionar los pedidos via Whatsapp, ya sea por texto o audio.

El asistente sera capaz de:

- Recordar los clientes y sus pedidos registrando su numero telefonico, nombre y direccion.
- Tomar pedidos de cada cliente evaluando la disponibilidades, precios y calidades diarias informadas por el vendedor o el duenio del negocio.
- Entender que todo se encuentra disponible a no ser que se informe lo contrario, al comenzar el dia el asistente puede preguntar sobre lo que falta por sucursal y si vuelve a estar disponible o no.
- Confirmar pedidos de los clientes, preguntando si retira en negocio y a que hora o recordando en caso que siempre el cliente pida a domicilio.
- Imprimir pedidos confirmados en la sucursal asignada o predeterminada.
- Escuchar el audio o texto del duenio o vendedor del negocio o vendedor al iniciar el dia para actualizar precios o disponibilidades.
- Escuchar audio o texto del duenio o vendedor en caso de que se acabe el stock de cierto producto.
- Pedir asistencia al vendedor o duenio en caso de bloqueo con el cliente, para continuar con el pedido.
- Tomar pedidos del vendedor o duenio en caso de ser necesario.

La creacion de una interfaz simple de administracion donde se muestren el estado de todos los flujos e interacciones del asistente y donde se puedan registrar los usuarios duenio y vendedor, las sucursales, los productos.



Requisitos no funcionales:

Evaluar la posibilidad de desplegar la aplicacion en sitio con agente o modelo de inteligencia artificial local para reducir costos operativos.

Definir un modelo de impresora termica

Definir un modelo de pedido a imprimir

Usaremos la API de Whatsapp Business
