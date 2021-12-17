import csv
import pandas as pd
from pandas import DataFrame as df
import numpy as np


class Tweet:
    # NB: encode int64 id and rt_id as alpha-prefixed strings to prevent Excel from mangling them
    def __init__(self, created_at, id, text, rt_id="", rt_user="", tag=""):
        weekday_abbr = ["M", "T", "W", "R", "F", "S", "U"]
        self.created_at = created_at
        self.date = created_at.date()
        self.weekday = weekday_abbr[created_at.weekday()]
        self.hour = created_at.time().hour
        self.minute = created_at.time().minute
        self.id = id
        self.rt_id = rt_id
        self.rt_user = rt_user
        self.text = text
        self.tag = tag

    def __eq__(self, other):
        if not isinstance(other, Tweet):
            # don't attempt to compare against unrelated types
            return NotImplemented

        return vars(self) == vars(other)


def load_df_from_csv(file):
    tweets_df = pd.read_csv(
        file,
        parse_dates=["created_at"],
        dtype={
            "id": np.object,
            "rt_id": np.object,
            "rt_user": np.object,
            "text": np.object,
            "tag": np.object,
        },
    )
    tweets_df = tweets_df.replace({np.nan: None})
    tweets_df = tweets_df.sort_values("created_at", ascending=False)
    return tweets_df


def load_from_csv(file):
    tweets_df = load_df_from_csv(file)
    tweets = []

    for _, row in tweets_df.iterrows():
        try:
            tweet = Tweet(
                created_at=row["created_at"],
                id=row["id"],
                text=row["text"],
                rt_id=(row["rt_id"] or ""),
                rt_user=(row["rt_user"] or ""),
                tag=row["tag"],
            )
        except:
            print(row)
            raise

        tweets.append(tweet)

    return tweets


def save_to_csv(file, tweets):
    tweets_df = df.from_records([vars(t) for t in tweets])
    tweets_df.to_csv(file, index=False, quoting=csv.QUOTE_ALL)
