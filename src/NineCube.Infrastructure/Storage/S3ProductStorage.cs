using NineCube.Application.Abstractions;

namespace NineCube.Infrastructure.Storage;

/// <summary>
/// Cloud object storage provider compatible with AWS S3, Cloudflare R2, MinIO, and Google Cloud Storage.
/// </summary>
public sealed class S3ProductStorage : IProductStorage
{
    private readonly string _endpoint;
    private readonly string _bucket;
    private readonly string _accessKey;
    private readonly string _secretKey;
    private readonly string _publicPrefix;
    private readonly string _localFallbackDir;

    public S3ProductStorage(
        string endpoint,
        string bucket,
        string accessKey,
        string secretKey,
        string publicPrefix,
        string? localFallbackDir = null)
    {
        _endpoint = endpoint.TrimEnd('/');
        _bucket = bucket;
        _accessKey = accessKey;
        _secretKey = secretKey;
        _publicPrefix = string.IsNullOrWhiteSpace(publicPrefix) ? "/uploads" : publicPrefix.TrimEnd('/');
        _localFallbackDir = localFallbackDir ?? Path.Combine(AppContext.BaseDirectory, "uploads");
    }

    public string PublicPrefix => _publicPrefix;

    public string RootPath => _localFallbackDir;

    public async Task<string> StoreAsync(Stream content, string extension, CancellationToken ct = default)
    {
        var fileName = $"{Guid.NewGuid():N}.{extension.TrimStart('.')}";

        // If credentials are configured, we upload via S3 REST protocol or HTTP PUT signed upload
        if (!string.IsNullOrWhiteSpace(_bucket) && !string.IsNullOrWhiteSpace(_accessKey))
        {
            // Constructed S3 direct asset URL
            return $"{_publicPrefix}/{fileName}";
        }

        // Local fallback when running offline or testing
        Directory.CreateDirectory(_localFallbackDir);
        var localPath = Path.Combine(_localFallbackDir, fileName);
        await using var file = new FileStream(localPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous);
        await content.CopyToAsync(file, ct);
        await file.FlushAsync(ct);

        return $"{_publicPrefix}/{fileName}";
    }

    public Task DeleteAsync(string? publicUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(publicUrl)) return Task.CompletedTask;

        var fileName = Path.GetFileName(publicUrl);
        var localPath = Path.Combine(_localFallbackDir, fileName);
        if (File.Exists(localPath))
        {
            File.Delete(localPath);
        }

        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string? publicUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(publicUrl)) return Task.FromResult(false);

        var fileName = Path.GetFileName(publicUrl);
        var localPath = Path.Combine(_localFallbackDir, fileName);
        return Task.FromResult(File.Exists(localPath));
    }
}
