"""Runtime configuration, read from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_user: str = "market"
    postgres_password: str = "market"
    postgres_db: str = "market_sentiment"

    # RabbitMQ
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "market"
    rabbitmq_password: str = "market"

    # FinBERT
    finbert_model: str = "ProsusAI/finbert"
    finbert_device: str = "cpu"
    # Load the model at process start instead of on first use. The worker needs
    # this; the API does not, and an idle eager copy costs ~1.3 GB of RSS.
    finbert_eager_load: bool = False
    # Torch grabs one thread per core by default. On a 16-core box that means
    # two model processes fighting over 32 threads, which starves everything
    # else on the machine for no throughput gain on short headlines.
    torch_threads: int = 2

    # Scraper
    scrape_interval_minutes: int = 10
    scrape_max_items: int = 25

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def amqp_url(self) -> str:
        return (
            f"amqp://{self.rabbitmq_user}:{self.rabbitmq_password}"
            f"@{self.rabbitmq_host}:{self.rabbitmq_port}/"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
