FROM node:22-bookworm-slim AS hls
WORKDIR /vendor
RUN npm install --no-save --package-lock=false --ignore-scripts hls.js@1.7.3

FROM nginxinc/nginx-unprivileged:1.28-alpine
ENV NGINX_ENVSUBST_FILTER=^RUNTIME_HOST$ RUNTIME_HOST=runtime
COPY web/nginx.conf /etc/nginx/templates/default.conf.template
COPY web/ui/ /usr/share/nginx/html/ui/
COPY --from=hls /vendor/node_modules/hls.js/dist/hls.min.js /usr/share/nginx/html/ui/vendor/hls.min.js
COPY --from=hls /vendor/node_modules/hls.js/LICENSE /usr/share/nginx/html/ui/vendor/hls.LICENSE
EXPOSE 8080
