using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace Tarjay.Team.Application.UnitTests.Approval;

/// <summary>
/// An <see cref="ILogger{T}"/> that keeps everything written to it, so a test can assert on what
/// was not logged.
/// </summary>
internal sealed class CapturingLogger<T> : ILogger<T>
{
    private readonly List<string> _lines = [];

    /// <summary>Every line logged, at every level, with its structured values.</summary>
    public IReadOnlyList<string> Lines => _lines;

    /// <summary>True if any logged line contains the given text.</summary>
    public bool ContainsText(string text) =>
        _lines.Any(line => line.Contains(text, StringComparison.Ordinal));

    public IDisposable BeginScope<TState>(TState state)
        where TState : notnull => NullScope.Instance;

    // Every level is enabled, so an assertion that a PIN never appears is given the chance to fail.
    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        ArgumentNullException.ThrowIfNull(formatter);

        var line = formatter(state, exception);

        if (exception is not null)
        {
            line = $"{line} {exception}";
        }

        // The structured values too. A PIN passed as a template argument would otherwise be
        // invisible to an assertion that reads only the rendered string.
        if (state is IEnumerable<KeyValuePair<string, object?>> values)
        {
            line = $"{line} {string.Join(" ", values.Select(value => $"{value.Key}={value.Value}"))}";
        }

        _lines.Add($"{logLevel}: {line}");
    }

    private sealed class NullScope : IDisposable
    {
        public static readonly NullScope Instance = new();

        public void Dispose()
        {
        }
    }
}
