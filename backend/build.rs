fn main() -> Result<(), Box<dyn std::error::Error>> {
    // In Docker: context root is repo root, proto lives at python/protos/
    // Locally:   this file is in backend/, proto lives at ../python/protos/
    let proto_paths = [
        "python/protos/finrl_service.proto",   // Docker (context = repo root)
        "../python/protos/finrl_service.proto", // local dev
    ];
    let include_paths = [
        "python/protos",
        "../python/protos",
    ];

    let proto = proto_paths.iter().find(|p| std::path::Path::new(p).exists())
        .expect("finrl_service.proto not found — run from repo root or backend/");
    let include = include_paths.iter().find(|p| std::path::Path::new(p).exists())
        .expect("proto include dir not found");

    tonic_build::configure()
        .build_server(false)
        .compile_protos(&[proto], &[include])?;
    Ok(())
}
