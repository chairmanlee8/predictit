import asyncio
import bottle
from bottle.ext import sqlite
import json
import jsonpickle
import jsonpickle.ext.pandas as jsonpickle_pandas
import logging
import pprint
import re
import requests
import sqlite3
import sys
import threading
import traceback
import websockets
import pandas as pd
from datetime import datetime, date
from common import Market, Bracket
from historical_analysis import predict, heatmap_daily, heatmap_hourly
from historical_merge import login, merge_load_twitter
from tweet import Tweet, load_df_from_csv, load_from_csv, save_to_csv

jsonpickle_pandas.register_handlers()
pp = pprint.PrettyPrinter(indent=4)

bottle.install(bottle.ext.sqlite.Plugin(dbfile="events.db"))


def setup_events_db():
    conn = sqlite3.connect("events.db")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        """
    CREATE TABLE IF NOT EXISTS events (
        date text,
        scheduled_start text,
        name text,
        tags text
    )
    """
    )
    conn.commit()


@bottle.route("/events/<year>/<month>/<day>")
def get_events(year, month, day, db):
    c = db.cursor()
    date = "%s-%s-%s" % (year, month, day)
    c.execute("select * from events where date = ?", (date,))
    results = list(map(dict, c.fetchall()))
    return jsonpickle.encode(results, unpicklable=False)


# https://stackoverflow.com/questions/50929768/pandas-multiindex-more-than-2-levels-dataframe-to-nested-dict-json
def nest(d: dict) -> dict:
    result = {}
    for key, value in d.items():
        target = result
        for k in key[:-1]:  # traverse all keys but the last
            target = target.setdefault(k, {})
        target[key[-1]] = value
    return result


def df_to_nested_dict(df: pd.DataFrame) -> dict:
    d = df.to_dict(orient="index")
    return {k: nest(v) for k, v in d.items()}


def get_market(id):
    r = requests.get(
        "https://www.predictit.org/api/marketdata/markets/" + str(id), timeout=15
    )
    j = r.json()
    pp.pprint(j)

    normalized_handle = {
        "whitehouse": "WhiteHouse",
        "realdonaldtrump": "realDonaldTrump",
        "potus": "POTUS",
    }
    handle = normalized_handle[
        re.search("@([a-zA-Z0-9]+)", j["shortName"]).group(1).lower()
    ]
    brackets = []

    for contract in j["contracts"]:
        r = re.search("(\d+)\s+.+\s+(\d+|fewer|more)", contract["name"])
        bound1 = r.group(1)
        bound2 = r.group(2)

        if bound2 == "fewer":
            lo = 0
            hi = int(bound1)
        elif bound2 == "more":
            lo = int(bound1)
            hi = 1_000_000
        else:
            lo = int(bound1)
            hi = int(bound2)

        bracket = Bracket(
            name=contract["shortName"],
            lo=lo,
            hi=hi,
            bid=contract["bestSellYesCost"],
            ask=contract["bestBuyYesCost"],
            last=contract["lastTradePrice"],
        )
        brackets.append(bracket)

    brackets = list(sorted(brackets, key=lambda b: b.lo))
    all_bid1 = 0.0
    all_ask1 = 0.0
    all_bid2 = 0.0
    all_ask2 = 0.0
    for i, bracket in enumerate(brackets):
        bracket.name = "B%d (%s)" % ((i + 1), bracket.name)
        if bracket.bid and (bracket.bid > 0.01 and bracket.bid < 0.99):
            all_bid1 += bracket.bid
            all_ask1 += bracket.ask
        if bracket.bid and (bracket.bid > 0.02 and bracket.bid < 0.98):
            all_bid2 += bracket.bid
            all_ask2 += bracket.ask

    brackets.append(Bracket(name="NET>0.01", lo=0, bid=all_bid1, ask=all_ask1))
    brackets.append(Bracket(name="NET>0.02", lo=0, bid=all_bid2, ask=all_ask2))

    m = Market(j["name"], handle, brackets)
    return m


market_id = None
market = None


async def handler(websocket, path):
    async for message in websocket:
        try:
            token, cmd, *args = json.loads(message)
            print(token)
            print(cmd)
            print(args)

            # message brochure
            #
            # [<request-token>, set-market, <market-id>]
            # [<request-token>, refresh-marketdata]
            # [<request-token>, refresh-tweets]
            # [<request-token>, predict, <adjust_current_count>]
            # [<request-token>, get-tweets, <handle>]

            if cmd == "set-market":
                market_id = args[0]
                market = get_market(market_id)
                await websocket.send(
                    jsonpickle.encode((token, market), unpicklable=False)
                )
            elif cmd == "refresh-marketdata":
                market = get_market(market_id)
                await websocket.send(
                    jsonpickle.encode((token, market), unpicklable=False)
                )
            elif cmd == "get-markets-and-predictions":
                eod_time = datetime.now().replace(
                    hour=23, minute=59, second=59, microsecond=0
                )

                def get_market_and_prediction(market_id, adjust_current_count):
                    market = get_market(market_id)
                    eod = predict(
                        market,
                        prediction_time=eod_time,
                        adjust_current_count=float(adjust_current_count),
                    )
                    eom = predict(
                        market, adjust_current_count=float(adjust_current_count)
                    )
                    return {"market": market, "eod": eod, "eom": eom}

                result = list(
                    map(lambda x: get_market_and_prediction(x[0], x[1]), args)
                )
                await websocket.send(
                    jsonpickle.encode((token, result), unpicklable=False)
                )
            elif cmd == "refresh-tweets":
                login()
                merge_load_twitter(market.handle)
                await websocket.send(
                    jsonpickle.encode((token, None), unpicklable=False)
                )
            elif cmd == "predict":
                adjust_current_count = float(args[0])
                eod = datetime.now().replace(
                    hour=23, minute=59, second=59, microsecond=0
                )
                eod_prediction = predict(
                    market,
                    prediction_time=eod,
                    adjust_current_count=adjust_current_count,
                )
                eom_prediction = predict(
                    market, adjust_current_count=adjust_current_count
                )

                await websocket.send(
                    jsonpickle.encode(
                        (token, {"eod": eod_prediction, "eom": eom_prediction}),
                        unpicklable=False,
                    )
                )
            elif cmd == "get-tweets":
                handle = args[0]
                [yyyy, mm, dd] = args[1].split("-")
                date_match = date(int(yyyy), int(mm), int(dd))
                hour_min = int(args[2])
                hour_max = int(args[3])
                tweets = load_from_csv(handle + ".csv")
                tweets = list(
                    filter(
                        lambda t: t.date == date_match
                        and t.hour >= hour_min
                        and t.hour <= hour_max,
                        tweets,
                    )
                )
                print(tweets)

                await websocket.send(
                    jsonpickle.encode((token, tweets), unpicklable=False)
                )
            elif cmd == "get-heatmap":
                handle = args[0]
                tweet_type = args[1]
                df = load_df_from_csv(handle + ".csv")

                if tweet_type == "original":
                    df = df[df["rt_user"].isnull()]
                elif tweet_type == "rt":
                    df = df[~df["rt_user"].isnull()]

                daily = heatmap_daily(df)
                daily = daily.to_dict(orient="index")

                hourly = heatmap_hourly(df)
                hourly.index = hourly.index.map(lambda t: str(t.date()))
                hourly = df_to_nested_dict(hourly)

                await websocket.send(
                    jsonpickle.encode(
                        (token, {"daily": daily, "hourly": hourly}), unpicklable=False,
                    )
                )
            else:
                print("Unrecognized command")
        except:
            print(traceback.format_exc())


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s %(levelname)s: %(message)s", level=logging.INFO
    )

    setup_events_db()
    http_thread = threading.Thread(
        target=bottle.run, kwargs=dict(host="0.0.0.0", port=8080, debug=True)
    )
    http_thread.daemon = True
    http_thread.start()

    start_server = websockets.serve(handler, "0.0.0.0", 7000)
    asyncio.get_event_loop().run_until_complete(start_server)
    asyncio.get_event_loop().run_forever()
