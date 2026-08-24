# Estágio 1: Construção (Build)
FROM node:20-alpine AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência primeiro (otimiza o cache do Docker)
COPY package*.json ./

# Instala todas as dependências (incluindo as de desenvolvimento)
RUN npm install

# Copia o restante do código
COPY . .

# Executa o processo de build (Vite + esbuild)
RUN npm run build

# Estágio 2: Produção (Imagem final otimizada)
FROM node:20-alpine

WORKDIR /app

# Copia apenas os arquivos de dependência
COPY package*.json ./

# Instala APENAS as dependências de produção (ignora devDependencies)
# Isso deixa a imagem muito mais leve e rápida para inicializar
RUN npm install --omit=dev

# Copia a pasta 'dist' gerada no estágio de build
COPY --from=builder /app/dist ./dist

# Define variáveis de ambiente para produção
ENV NODE_ENV=production
ENV PORT=3000

# Expõe a porta 3000
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
