burger-grill/
├── server.js              # Backend Express (rotas, validação, cálculo, persistência)
├── config.json            # Chave Pix, recebedor, número do WhatsApp
├── products.json          # Catálogo (id, nome, descrição, preço, imagem, categoria)
├── orders.json            # Histórico de pedidos (gerado em runtime)
├── package.json           # Dependências: express, helmet, cors, qrcode
├── package-lock.json
├── README.md              # Instruções de execução, API e deploy
├── .gitignore             # ignora node_modules, orders.json, *.log
└── public/                # Frontend estático servido pelo Express
    ├── index.html         # Cardápio, carrinho, checkout, Pix, histórico
    ├── app.js             # Lógica do frontend (envia só id+qtd ao backend)
    ├── styles.css         # Tema hamburgueria artesanal
    └── assets/            # Imagens dos produtos (opcional)
