#include "abi.h"
#include <cmath>
#include <vector>

// Edit this heuristic, save, and watch the same prepared netlist update.
// A higher exponent reduces the influence of high-fanout nets on move scores.
constexpr double FANOUT_EXPONENT = 0.0;

extern "C" int relive_abi() { return 1; }
extern "C" int partition(const Hypergraph* g, const PartitionParams* p, int32_t* out) {
    const int n = g->vertices, k = p->parts;
    if (n < k || k < 2 || k > 16 || p->passes < 0) return -1;
    const int capacity = int(std::ceil(double(n) / k * (1.0 + p->imbalance)));
    std::vector<int> order(n), size(k, 0), count(g->edges * k, 0);
    for(int i=0;i<n;++i) order[i]=i;
    // Explicit integer PRNG keeps the order reproducible across standard libraries
    // and avoids bringing a large random-distribution implementation into the edit.
    uint32_t rng = p->seed ? uint32_t(p->seed) : 0x9e3779b9u;
    auto shuffle = [&]() {
        for(int i=n-1;i>0;--i) {
            rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
            int j=int(rng%uint32_t(i+1)); std::swap(order[i],order[j]);
        }
    };
    shuffle();
    for (int i = 0; i < n; ++i) { out[order[i]] = i % k; ++size[i % k]; }
    for (int e = 0; e < g->edges; ++e)
        for (int j = g->offsets[e]; j < g->offsets[e+1]; ++j) ++count[e*k + out[g->pins[j]]];
    for (int pass = 0; pass < p->passes; ++pass) {
        int moved = 0;
        shuffle();
        for (int v : order) {
            int from = out[v], best = from;
            double best_gain = 0;
            for (int to = 0; to < k; ++to) {
                if (to == from || size[to] >= capacity || size[from] <= 1) continue;
                double gain = 0;
                for (int j = g->incident_offsets[v]; j < g->incident_offsets[v+1]; ++j) {
                    int e = g->incident_edges[j];
                    double weight = 1.0 / std::pow(double(g->offsets[e+1]-g->offsets[e]), FANOUT_EXPONENT);
                    gain += weight * ((count[e*k+from] == 1 ? 1.0 : 0.0) - (count[e*k+to] == 0 ? 1.0 : 0.0));
                }
                if (gain > best_gain + 1e-9) { best_gain = gain; best = to; }
            }
            if (best == from) continue;
            for (int j = g->incident_offsets[v]; j < g->incident_offsets[v+1]; ++j) {
                int e = g->incident_edges[j]; --count[e*k+from]; ++count[e*k+best];
            }
            --size[from]; ++size[best]; out[v] = best; ++moved;
        }
        if (!moved) break;
    }
    return 0;
}
