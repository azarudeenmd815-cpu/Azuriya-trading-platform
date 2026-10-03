FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S azuriya && adduser -S azuriya -G azuriya
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /src/migrations /app/migrations
USER azuriya
EXPOSE 8080
ENTRYPOINT ["/app/api"]
