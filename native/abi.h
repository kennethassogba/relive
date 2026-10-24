#pragma once
#include <cstdint>
// ABI 1: borrowed, immutable flat buffers. Nothing allocated by a plugin crosses
// the boundary. The host allocates output; a worker owns each library lifetime.
struct Hypergraph {
    int32_t vertices, edges;
    const int32_t *offsets, *pins, *incident_offsets, *incident_edges;
};
struct PartitionParams { int32_t parts, passes, seed; double imbalance; };
using EdgeCost = double (*)(double length, double bend, double feature_weight);
