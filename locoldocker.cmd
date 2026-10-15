docker run -d --name escape-server-lan-test --env-file .env.docker-test -p 3001:3000 escape-server:lan-test
docker logs escape-server-lan-test
Invoke-RestMethod http://127.0.0.1:3001/health