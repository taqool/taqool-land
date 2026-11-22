FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-api-config.sh /docker-entrypoint.d/40-api-config.sh
COPY index.html 404.html CNAME .nojekyll /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 8080
