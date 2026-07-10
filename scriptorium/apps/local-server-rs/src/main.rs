use scriptorium_local_server::{config::ServerConfig, server::serve};

#[tokio::main]
async fn main() {
    let config = match ServerConfig::from_args(std::env::args().skip(1)) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    if let Err(error) = serve(config).await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
