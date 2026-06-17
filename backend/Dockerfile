FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/motobingo-api-1.0.0.jar app.jar
EXPOSE 8787
ENV JAVA_OPTS="-XX:+UseSerialGC -XX:MaxRAMPercentage=75 -Xss256k"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
