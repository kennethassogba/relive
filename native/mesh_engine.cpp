#include "abi.h"
#include <igl/decimate.h>
#include <igl/max_faces_stopping_condition.h>
#include <igl/decimate_trivial_callbacks.h>
#include <igl/point_mesh_squared_distance.h>
#include <igl/connect_boundary_to_infinity.h>
#include <igl/remove_unreferenced.h>
#include <Eigen/Geometry>
#include <chrono>
#include <cmath>
#include <limits>

struct Mesh { Eigen::MatrixXd v, closed_v; Eigen::MatrixXi f, closed_f; std::vector<bool> boundary; };
extern "C" void* mesh_prepare(int nv, const double* v, int nf, const int32_t* f) {
    auto* m = new Mesh;
    m->v = Eigen::Map<const Eigen::Matrix<double,Eigen::Dynamic,3,Eigen::RowMajor>>(v,nv,3);
    m->f = Eigen::Map<const Eigen::Matrix<int,Eigen::Dynamic,3,Eigen::RowMajor>>(f,nf,3);
    igl::connect_boundary_to_infinity(m->v,m->f,m->closed_v,m->closed_f);
    m->boundary.resize(m->closed_v.rows(),false);
    for(int face=nf;face<m->closed_f.rows();++face)
        for(int c=0;c<3;++c) m->boundary[m->closed_f(face,c)]=true;
    return m;
}
extern "C" void mesh_free(void* ptr) { delete static_cast<Mesh*>(ptr); }
extern "C" int mesh_run(void* ptr, EdgeCost cost_fn, int target, double feature_weight,
        double* positions, int32_t* faces, double* errors, int32_t* sizes, double* timings) {
    try {
        auto& m = *static_cast<Mesh*>(ptr);
        auto start = std::chrono::steady_clock::now();
        Eigen::MatrixXd u; Eigen::MatrixXi g; Eigen::VectorXi j, i;
        igl::decimate_cost_and_placement_callback cost = [&](const int e, const Eigen::MatrixXd& v,
                const Eigen::MatrixXi& f, const Eigen::MatrixXi& edges, const Eigen::VectorXi&,
                const Eigen::MatrixXi& ef, const Eigen::MatrixXi&, double& value, Eigen::RowVectorXd& placement) {
            auto a = v.row(edges(e,0)); auto b = v.row(edges(e,1));
            placement = (a+b)*0.5;
            if(m.boundary[edges(e,0)] || m.boundary[edges(e,1)]) {
                value=std::numeric_limits<double>::infinity(); return;
            }
            double bend = 0;
            if (ef(e,0) >= 0 && ef(e,1) >= 0) {
                auto normal = [&](int face) -> Eigen::Vector3d {
                    Eigen::Vector3d x = v.row(f(face,1))-v.row(f(face,0));
                    Eigen::Vector3d y = v.row(f(face,2))-v.row(f(face,0));
                    Eigen::Vector3d z = x.cross(y); return z.normalized();
                };
                bend = std::clamp(1.0-normal(ef(e,0)).dot(normal(ef(e,1))), 0.0, 2.0);
            }
            value = cost_fn((a-b).norm(), bend, feature_weight);
            if (!std::isfinite(value) || value < 0) value = std::numeric_limits<double>::infinity();
        };
        int remaining = m.f.rows();
        igl::decimate_pre_collapse_callback pre; igl::decimate_post_collapse_callback post;
        igl::decimate_trivial_callbacks(pre,post);
        bool reached = igl::decimate(m.closed_v,m.closed_f,cost,igl::max_faces_stopping_condition(remaining,m.f.rows(),target),pre,post,u,g,j,i);
        if(g.rows()<1) return -2;
        // Discard temporary triangles connected to the vertex at infinity.
        std::vector<int> keep;
        for(int row=0;row<g.rows();++row) if(j(row)<m.f.rows()) keep.push_back(row);
        Eigen::MatrixXi finite_faces(keep.size(),3);
        for(size_t row=0;row<keep.size();++row) finite_faces.row(row)=g.row(keep[row]);
        Eigen::VectorXi old_to_new,new_to_old;
        igl::remove_unreferenced(Eigen::MatrixXd(u),finite_faces,u,g,old_to_new,new_to_old);
        auto simplified = std::chrono::steady_clock::now();
        if (g.rows() < 1) return -2;
        // Directed, vertex-sampled input-to-output surface distance, not Hausdorff.
        Eigen::VectorXd d; Eigen::VectorXi nearest; Eigen::MatrixXd closest;
        igl::point_mesh_squared_distance(m.v,u,g,d,nearest,closest);
        for (int row=0; row<u.rows(); ++row) for (int col=0; col<3; ++col) positions[3*row+col]=u(row,col);
        for (int row=0; row<g.rows(); ++row) for (int col=0; col<3; ++col) faces[3*row+col]=g(row,col);
        for (int row=0; row<d.size(); ++row) errors[row]=std::sqrt(std::max(0.0,d(row)));
        sizes[0]=u.rows(); sizes[1]=g.rows(); sizes[2]=reached ? 1 : 0;
        timings[0]=std::chrono::duration<double,std::milli>(simplified-start).count();
        timings[1]=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-simplified).count();
        return 0;
    } catch (...) { return -3; }
}
