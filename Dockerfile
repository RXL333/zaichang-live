FROM node:24-alpine AS frontend
WORKDIR /app/live-web
COPY live-web/package*.json ./
RUN npm ci
COPY live-web/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS backend
WORKDIR /app/live-server
COPY live-server/pom.xml ./
RUN mvn -B dependency:go-offline -DskipTests
COPY live-server/src ./src
COPY --from=frontend /app/live-web/dist/ ./src/main/resources/static/
RUN mvn -B package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=backend /app/live-server/target/live-server-1.0.0.jar /app/app.jar
EXPOSE 10000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=50.0", "-jar", "/app/app.jar"]
