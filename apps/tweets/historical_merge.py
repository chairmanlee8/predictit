import logging, math, os, pprint, sys, time
from datetime import datetime
from pytz import timezone
import requests
from tweet import Tweet, load_from_csv, save_to_csv

API_KEY = "j7EjswpEWiAw0Ax8y2pvBTfQ9"
API_SECRET_KEY = "kxHPYjy5cvVt97EtHnAIDO5dnQnjef8HW1bHKLnZ6hcGdsNb0r"
BEARER_TOKEN = ""

pp = pprint.PrettyPrinter(indent=4)


def login():
    r = requests.post(
        "https://api.twitter.com/oauth2/token",
        data={
            "grant_type": "client_credentials",
            "client_id": API_KEY,
            "client_secret": API_SECRET_KEY,
        },
    )

    global BEARER_TOKEN
    BEARER_TOKEN = r.json()["access_token"]


def excel_proof_of_id(id):
    return "ID" + str(id)


def id_of_excel_proof(mangled_id):
    return int(mangled_id[2:])


def get_tweets(screen_name, max_count, tweets=[], oldest_id=None):
    logging.info(
        "getting more tweets, screen_name=%s, count=%d, max_count=%d",
        screen_name,
        len(tweets),
        max_count,
    )

    params = {
        "screen_name": screen_name,
        "count": 200,
        "exclude_replies": False,
        "include_rts": True,
        "tweet_mode": "extended",
    }

    if oldest_id:
        params["max_id"] = id_of_excel_proof(oldest_id) - 1

    r = requests.get(
        "https://api.twitter.com/1.1/statuses/user_timeline.json",
        headers={"Authorization": "Bearer " + BEARER_TOKEN},
        params=params,
    )

    j = r.json()

    def escape(s):
        return s.replace("\r", "").replace("\n", "")

    def parse(x):
        created_at = datetime.strptime(
            x["created_at"], "%a %b %d %H:%M:%S %z %Y"
        ).astimezone(timezone("US/Eastern"))

        rt_id = ""
        rt_user = ""

        if "retweeted_status" in x:
            rt_id = excel_proof_of_id(x["retweeted_status"]["id"])
            rt_user = x["retweeted_status"]["user"]["screen_name"]

        return Tweet(
            created_at,
            excel_proof_of_id(x["id"]),
            escape(x["full_text"]),
            rt_id,
            rt_user,
        )

    ts = list(sorted(map(parse, j), key=lambda x: x.created_at))

    if len(ts) <= 0:
        return tweets
    else:
        oldest_id = ts[0].id

        if len(tweets) + 200 < max_count:
            time.sleep(1.0)
            return get_tweets(screen_name, max_count, ts + tweets, oldest_id)
        else:
            return list(reversed(ts + tweets))[:max_count]


def merge_load_twitter(screen_name):
    logging.info("merge load for %s", screen_name)

    tweets_csv = screen_name + ".csv"
    num_tweets_per_account = 600  # CR: used to be int(sys.argv[2])

    existing_tweets = {}

    if os.path.isfile(tweets_csv):
        for tweet in load_from_csv(tweets_csv):
            existing_tweets[tweet.id] = tweet

    logging.info("found %d existing tweets", len(existing_tweets))

    tweets = get_tweets(screen_name, num_tweets_per_account)
    tweet_ids = set()
    new_tweet_ids = set()

    # CR: support deletes (wont be a perfect detection but regular merging should be perfect)

    # CR: rdt thread missed a tweet today--check load logic for off-by-one
    # CR: more tweet categories
    # CR: cross-account (most important for POTUS) considerations
    # i.e. WhiteHouse Trumps vs DJT originals %

    # merge existing tweet tags and check for diffs
    for tweet in tweets:
        tweet_ids.add(tweet.id)

        if tweet.id in existing_tweets:
            tweet.tag = existing_tweets[tweet.id].tag

            # if tweet != existing_tweets[tweet.id]:
            #    pp.pprint(vars(tweet))
            #    pp.pprint(vars(existing_tweets[tweet.id]))
            #    raise ValueError("merge failed, tweet did not match existing tweet")
        else:
            new_tweet_ids.add(tweet.id)

    # add existing tweets if not loaded (e.g. partial update)
    for id, tweet in existing_tweets.items():
        if id not in tweet_ids:
            tweets.append(tweet)

    logging.info("added %d new tweets", len(new_tweet_ids))
    logging.info("saving...")

    if os.path.isfile(tweets_csv):
        os.rename(tweets_csv, tweets_csv + ".bak")

    save_to_csv(tweets_csv, tweets)


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s %(levelname)s: %(message)s", level=logging.INFO
    )

    login()
    merge_load_twitter(sys.argv[1])
