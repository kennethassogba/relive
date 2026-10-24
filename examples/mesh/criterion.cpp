#include <cmath>
// libigl calls this compiled function for every candidate edge collapse.
// bend = 1 - dot(adjacent face normals), in [0, 2].
constexpr double FEATURE_BIAS = 0.0;
extern "C" int relive_abi() { return 1; }
extern "C" double edge_cost(double length, double bend, double feature_weight) {
    return length * (1.0 + FEATURE_BIAS * feature_weight * bend * bend);
}
