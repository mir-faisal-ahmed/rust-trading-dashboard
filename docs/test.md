curl -X GET "https://paper-api.alpaca.markets/v2" \
     -H "APCA-API-KEY-ID: PKBECYDHNS4I5VVO7A6FWORZLR" \
     -H "APCA-API-SECRET-KEY: CoAExrtT4F82L2BZiKTHAfkbucyCMKnZqEf7jDVEfxLb"



curl -X POST "https://paper-api.alpaca.markets/v2/orders" \
     -H "APCA-API-KEY-ID: PKBECYDHNS4I5VVO7A6FWORZLR" \
     -H "APCA-API-SECRET-KEY: CoAExrtT4F82L2BZiKTHAfkbucyCMKnZqEf7jDVEfxLb" \
     -H "Content-Type: application/json" \
     -d '{
       "symbol": "TSLA",
       "qty": "10",
       "side": "buy",
       "type": "limit",
       "limit_price": "150.00",
       "time_in_force": "day"
     }'


STRATEGY_ID=$(curl -s http://localhost:8080/api/v1/strategies | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
echo "Strategy ID: $STRATEGY_ID"

curl -s -X POST http://localhost:8080/api/v1/benchmarks \
  -H "Content-Type: application/json" \
  -d "{"strategy_id": "$STRATEGY_ID", "start_date": "2023-01-01", "end_date": "2024-12-31", "initial_capital": 100000}" \
  | python3 -m json.tool